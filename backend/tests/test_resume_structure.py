import unittest

from backend.services.common import ApiError
from backend.services.resume_structure import (resume_sections, validate_resume_fields, validate_resume_metadata,
    validate_soft_skills, pet_projects_text)
from backend.services.directory import public_candidate, _query_score
from backend.services.assessment import validate_survey


def fields():
    return {"workExperiences": [{"period": "2023-01 — 2024-05", "company": "Лаборатория", "tasks": "API на FastAPI"}],
            "petProjects": [{"name": "Телеметрия", "description": "Мониторинг на MQTT", "stack": ["Python", "ESP32"]}],
            "achievementItems": ["Призёр хакатона"], "interests": ["Робототехника"]}


class ResumeStructureTest(unittest.TestCase):
    def test_structured_authority_and_metadata_copy(self):
        incoming = {**fields(), "workHistory": "старое", "careerAchievements": "старое"}
        checked = validate_resume_fields(incoming)
        self.assertEqual(checked["workHistory"], "Лаборатория\n2023-01 — 2024-05\nAPI на FastAPI")
        self.assertEqual(checked["careerAchievements"], "Призёр хакатона")
        incoming["petProjects"][0]["stack"].append("Vue")
        self.assertEqual(checked["petProjects"][0]["stack"], ["Python", "ESP32"])
        self.assertEqual(validate_resume_metadata({}), {})

    def test_migration(self):
        result = resume_sections({"workHistory": "Разрабатывал API", "careerAchievements": "Достижения\n• Призёр\nДополнительно\n• Сети"})
        self.assertEqual(result["workExperiences"], [{"period": "", "company": "", "tasks": "Разрабатывал API"}])
        self.assertEqual(result["achievementItems"], ["Призёр"])
        self.assertEqual(result["interests"], ["Сети"])

    def test_legacy_project_section_is_not_an_employer(self):
        result = resume_sections({"workHistory": "Работа в лаборатории\nPet-проекты\nНазвание: Телеметрия\nОписание: Датчики\nСтек: Python, ESP32"})
        self.assertEqual(result["workExperiences"], [{"company": "", "period": "", "tasks": "Работа в лаборатории"}])
        self.assertEqual(result["petProjects"], [{"name": "Телеметрия", "description": "Датчики", "stack": ["Python", "ESP32"]}])

    def test_ocr_pet_heading_migrates_only_standalone_visual_aliases(self):
        history = "Работа в Example Studio\nРазработал интерфейсы каталога"
        project = "Название: Планировщик\nОписание: Приложение для планирования встреч\nСтек: React, TypeScript"
        for heading in ("Рет-проекты", "Peт-проекты", "Рeт-проекты", "Реt-проекты:"):
            with self.subTest(heading=heading):
                source = history + "\n" + heading + "\n" + project
                migrated = resume_sections({"workHistory": source})
                self.assertEqual(migrated["workExperiences"], [{"period": "", "company": "", "tasks": history}])
                self.assertEqual(migrated["petProjects"], [{"name": "Планировщик", "description": "Приложение для планирования встреч", "stack": ["React", "TypeScript"]}])
                self.assertEqual(validate_resume_fields({"workHistory": source, **migrated})["workHistory"], history)
        for prose in ("Разрабатывал Рет-проекты в учебной команде", "Рет-проекты помогают изучать технологии", "Рет-проекты: разработал несколько приложений"):
            with self.subTest(prose=prose):
                source = history + "\n" + prose
                migrated = resume_sections({"workHistory": source})
                self.assertEqual(migrated["petProjects"], [])
                self.assertEqual(migrated["workExperiences"][0]["tasks"], source)

    def test_malformed_and_over_budget(self):
        for item in [{"workExperiences": [{}]}, {"petProjects": [{"name": "x", "description": "", "stack": [3]}]},
                     {"interests": ["x" * 4001]}, {"achievementItems": ["x" * 3000, "y" * 2000]},
                     {"workExperiences": [{"period": "", "company": "", "tasks": "x" * 4000}] * 6}]:
            with self.assertRaises(ApiError):
                validate_resume_fields(item)
        self.assertEqual(len(validate_soft_skills([f"Навык {index}" for index in range(30)])), 30)
        with self.assertRaises(ApiError):
            validate_soft_skills([f"Навык {index}" for index in range(31)])

    def test_nested_privacy_and_search(self):
        incoming = fields()
        incoming["workExperiences"][0]["tasks"] += "; private@example.invalid; +7 999 123 45 67"
        incoming["petProjects"][0]["description"] += "; project@example.invalid"
        incoming["interests"] += ["mail@example.invalid"]
        checked = public_candidate({"id": "candidate", "achievements": [], **incoming})
        self.assertNotIn("@example.invalid", str(checked))
        self.assertEqual(checked["achievements"], [])
        self.assertEqual(checked["workExperiences"][0]["period"], "2023-01 — 2024-05")
        self.assertGreater(_query_score(incoming, "MQTT"), 0)
        self.assertEqual(_query_score(incoming, "private@example.invalid"), 0)

    def test_assessment_retains_core_only_contract_and_expanded_soft_skill_limit(self):
        incoming = {"id": "survey", "date": "2026-10-11T12:00:00Z", "industry": "ИТ", "professionalRole": "Backend",
                    "specialization": "Backend", "desiredGrade": "Junior", "experience": "1 год", "stack": ["Python"],
                    "softSkills": [f"Навык {index}" for index in range(30)], **fields()}
        checked = validate_survey(incoming)
        self.assertNotIn("petProjects", checked)
        self.assertNotIn("workExperiences", checked)
        self.assertEqual(len(checked["softSkills"]), 30)

    def test_legacy_boundary_roundtrip_and_public_short_fields(self):
        history = "x" * 20000
        incoming = {"workHistory": history, **resume_sections({"workHistory": history})}
        checked = validate_resume_fields(incoming)
        self.assertEqual(checked["workHistory"], history)
        self.assertEqual(resume_sections(checked)["workExperiences"], incoming["workExperiences"])
        self.assertEqual(validate_resume_fields({**checked, **resume_sections(checked)})["workHistory"], history)
        checked["workExperiences"][0]["company"] = "Новая компания"
        with self.assertRaises(ApiError):
            validate_resume_fields(checked)
        public = public_candidate({"city": "city-private@example.invalid", "format": "+7 999 123 45 67", "portfolio": "https://example.invalid/private@example.invalid"})
        self.assertNotIn("@example.invalid", str(public))
        self.assertNotIn("999 123 45 67", str(public))
        self.assertEqual(public["portfolio"], "")

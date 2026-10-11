/** Use the visible competency picker; these helpers do not bypass form state. */
export async function fillResumeStack(target, skills) {
  const field = target.locator('.competency-field').first();
  const search = field.getByRole('searchbox');
  await search.fill('');
  while (await field.locator('input[type="checkbox"]:checked').count()) await field.locator('input[type="checkbox"]:checked').first().uncheck();
  for (const skill of skills) {
    await search.fill(skill);
    const option = field.getByRole('checkbox', { name: skill, exact: true });
    if (await option.count()) await option.check();
    else await field.getByRole('button', { name: `Добавить «${skill}»`, exact: true }).click();
  }
  await search.fill('');
}

export async function fillResumeWork(target, tasks) {
  while (await target.getByRole('button', { name: /^Удалить место работы / }).count()) await target.getByRole('button', { name: /^Удалить место работы / }).first().click();
  await target.getByRole('button', { name: 'Добавить место работы', exact: true }).click();
  await target.getByLabel('Задачи 1', { exact: true }).fill(tasks);
}

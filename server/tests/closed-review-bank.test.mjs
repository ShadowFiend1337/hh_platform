import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewQuestions,reviewGrades } from '../review-bank.mjs';
import { closedReviewCases,closedReviewCoverage,closedReviewSheet,validateClosedReviewBank } from '../closed-review-bank.mjs';

test('closed cases preserve the complete open competency/grade matrix, with two usable choices each',()=>{
  assert.deepEqual(validateClosedReviewBank(),[]);
  const coverage=closedReviewCoverage();
  assert.equal(coverage.cases,165); assert.equal(coverage.questions,330);
  for(const grade of reviewGrades) assert.deepEqual(coverage.byGrade[grade],{cases:33,questions:66});
  for(const item of closedReviewCases) {
    const open=reviewQuestions.find(q=>q.id===item.pairedOpenId);
    assert.deepEqual(item.specializations,open.specializations);
    assert.deepEqual(item.testedSkills,open.testedSkills);
    assert.equal(item.review.active,false);
    for(const q of item.questions) assert.ok(q.options[q.correct].length);
  }
});

test('public review sheets do not leak keys or explanations, including nested questions',()=>{
  for(const item of closedReviewCases) {
    const sheet=closedReviewSheet(item);
    for(const question of sheet.questions) {
      assert.equal(Object.hasOwn(question,'correct'),false);
      assert.equal(Object.hasOwn(question,'explanation'),false);
      assert.throws(()=>question.options.push('x'),TypeError);
    }
    assert.equal(Object.hasOwn(sheet,'generationContract'),false);
  }
});

test('wrong keys, duplicate alternatives, broken pairs and child provenance cannot be admitted',()=>{
  const broken=structuredClone(closedReviewCases);
  broken[0].questions[0].correct=4;
  broken[1].questions[0].options[1]=broken[1].questions[0].options[0];
  broken[2].pairedOpenId=broken[1].pairedOpenId;
  broken[3].questions[0].sourceRefs=[];
  broken[4].review.active=true;
  const errors=validateClosedReviewBank(broken);
  for(const type of ['invalid choices/key','invalid pair','changed source references','draft must not certify']) {
    assert.ok(errors.some(error=>error.includes(type)),type);
  }
});

test('numeric keys match independently computed core cases',()=>{
  const chosen=(id,n=0)=>{const q=closedReviewCases.find(c=>c.id===id).questions[n];return q.options[q.correct];};
  const x=[0,1,2],y=[1,2,2],xm=1,ym=y.reduce((a,b)=>a+b)/3;
  const b=x.reduce((a,v,i)=>a+(v-xm)*(y[i]-ym),0)/x.reduce((a,v)=>a+(v-xm)**2,0);
  assert.equal(b,.5); assert.ok(Math.abs(ym-b*xm-7/6)<1e-12);
  assert.equal(chosen('research-mc:mathematics:Intern'),'a=7/6, b=1/2');
  assert.equal(chosen('research-mc:probability:Junior'),'Около 13.85%');
  assert.ok(Math.abs((.005*.96)/(.005*.96+.995*.03)-.138528138528)<1e-10);
  assert.equal(chosen('research-mc:statistics:Lead'),'640; расследовать назначения и потери данных до интерпретации uplift');
  assert.equal(2*(54000-50000)**2/50000,640);
  assert.equal(chosen('research-mc:product-management:Lead'),'A+B и B+C');
  assert.deepEqual([[5,3],[5,4],[3,4]].map(p=>p[0]+p[1]<=8),[true,false,true]);
  assert.equal(chosen('research-mc:deep-learning:Junior',1),'1.4');
  assert.equal((4*1+1*3)/5,1.4);
});

// Every link declares its actual role. No record claims a verbatim exercise import.
const focus = {
  'sql:Junior': ['pg-exercises', 'Aggregation catalog: window-function exercises; related technique, different problem'],
  'sql:Senior': ['postgres-isolation', 'Read Committed: concurrent UPDATE and row conditions'],
  'sql:Lead': ['postgres-index', 'Building Indexes Concurrently; partial/expression indexes'],
  'python:Senior': ['python-asyncio', 'Task Groups; Task Cancellation; Timeouts'],
  'react:Intern': ['react-effects', 'Updating state based on props or state'],
  'classical-ml:Junior': ['sklearn-leakage', 'Data leakage; preprocessing within Pipeline'],
  'classical-ml:Senior': ['sklearn-threshold', 'Separating probability estimation and decision thresholds; prior-shift calculation is authored'],
  'statistics:Lead': ['exp-srm', 'Does my A/B test have an SRM?; diagnosis before effect interpretation'],
};
const primary = { statistics: 'mit-statistics', 'javascript-typescript': 'typescript', react: 'react',
  'vue-angular': 'vue', 'backend-api': 'fastapi', 'java-go': 'ex-java', 'mobile-native': 'android',
  'mobile-cross': 'flutter', dataframes: 'pandas', 'classical-ml': 'sklearn', 'deep-learning': 'pytorch',
  'business-intelligence': 'powerbi', 'batch-pipelines': 'spark', streaming: 'kafka',
  'systems-networking': 'linux', containers: 'kubernetes', infrastructure: 'terraform',
  observability: 'prometheus', 'delivery-git': 'git', 'test-design': 'atlassian',
  'test-automation': 'playwright', 'application-security': 'portswigger', 'ux-design': 'figma',
  'business-analysis': 'bpmn', 'product-management': 'atlassian',
  'embedded-firmware': 'stm32', 'embedded-hardware': 'oscilloscope' };
const gradePrimary = {
  'mathematics:Junior':'mit-calculus', 'java-go:Junior':'ex-go', 'java-go:Middle':'ex-go',
  'vue-angular:Junior':'angular', 'vue-angular:Senior':'angular',
  'mobile-native:Junior':'ios', 'mobile-native:Senior':'ios',
  'deep-learning:Intern':'tensorflow', 'business-intelligence:Intern':'excel',
  'business-intelligence:Middle':'tableau', 'containers:Intern':'docker',
  'infrastructure:Intern':'ansible', 'batch-pipelines:Junior':'airflow',
  'test-automation:Junior':'selenium', 'test-automation:Middle':'postman',
};

export function withProvenance(question, sources) {
  const precise = focus[`${question.competencyId}:${question.grade}`];
  const first = precise?.[0] || gradePrimary[`${question.competencyId}:${question.grade}`]
    || primary[question.competencyId] || question.sourceIds[0];
  const ids = [...new Set([first, ...question.sourceIds])];
  const sourceRefs = ids.map(id => {
    const source = sources.find(item => item.id === id);
    if (!source) throw new Error('Unknown provenance: ' + id);
    return { sourceId: id, url: source.url, title: source.title,
      relationship: precise && id === first ? 'technical-reference' : 'topic-reference',
      locator: precise && id === first ? precise[1] : 'Source topic/index; no individual exercise attribution',
      verification: source.verification, accessedAt: source.accessedAt,
      limitation: 'Authored scenario and grade estimate; not a verbatim source exercise.' };
  });
  return { ...question, sourceIds: ids, sourceUrl: sourceRefs[0].url, sourceRefs };
}

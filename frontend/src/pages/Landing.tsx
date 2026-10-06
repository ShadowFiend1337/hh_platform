import { useRef, useState, type FormEvent } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { ArrowDown, ArrowRight, ArrowUpRight, BadgeCheck, Check, CheckCheck, FileSliders, Layers3, Menu, Plus, Search, UsersRound, X } from 'lucide-react';
import { Brand } from '../components/Brand';
import { PlatformPreview } from '../components/PlatformPreview';
import type { Role } from '../model';

const examples = [
  { title: 'Frontend', brief: 'Frontend Middle React TypeScript' },
  { title: 'Backend', brief: 'Backend Middle Python PostgreSQL' },
  { title: 'Junior', brief: 'Frontend Junior JavaScript' },
];
const variants = ['Подбор', 'Профиль', 'Приглашение'];

export function Landing({ onStart }: { onStart: (role?: Role, query?: string) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [variant, setVariant] = useState(0);
  const [brief, setBrief] = useState('');
  const [direction, setDirection] = useState('');
  const briefInput = useRef<HTMLTextAreaElement>(null);
  const hero = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: hero, offset: ['start start', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const rotate = useTransform(scrollYProgress, [0, 1], [-7, 6]);
  const reveal = {
    initial: reduced ? (false as const) : { opacity: 0, y: 25 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.15 },
    transition: { duration: reduced ? 0 : 0.55 },
  };
  function submit(event: FormEvent) {
    event.preventDefault();
    if (brief.trim()) onStart('employer', [direction, brief.trim()].filter(Boolean).join(' '));
  }
  return <div className="landing">
    <a className="skip-link" href="#main">К содержимому</a>
    <header className="floating-header">
      <div className="nav-island"><Brand /><nav aria-label="Главная навигация">
        <a href="#possibilities">Возможности</a><a href="#how">Как это работает</a><a href="#try">Подбор</a>
      </nav><button className="menu-toggle icon-button" aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button></div>
      <div className="account-island"><button className="login-link" onClick={() => onStart('candidate')}>Кандидату</button><button className="button ink small" onClick={() => onStart()}>Попробовать<ArrowUpRight size={16} /></button></div>
      {menuOpen && <nav className="mobile-menu" aria-label="Мобильная навигация">
        {[['#possibilities', 'Возможности'], ['#how', 'Как это работает'], ['#try', 'Подбор']].map(([href, text]) => <a href={href} key={href} onClick={() => setMenuOpen(false)}>{text}<ArrowUpRight size={18} /></a>)}
      </nav>}
    </header>
    <main id="main">
      <section className="hero" ref={hero}>
        <div className="hero-grid" aria-hidden="true" />
        <motion.div className="hero-art" style={reduced ? {} : { y, rotate }} initial={{ opacity: 0, scale: .88 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: reduced ? 0 : .85 }}>
          <img src="/assets/images/predel-keychain.png" alt="Брелоки со знаком predel" width="1024" height="1536" fetchPriority="high" />
        </motion.div>
        <motion.div className="hero-copy" initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduced ? 0 : .15, duration: reduced ? 0 : .65 }}>
          <h1>Ваши навыки.<br /><span>Подходящая команда.</span></h1>
          <p className="hero-description">Подтвердите уровень и получайте предложения<br className="mobile-break" /> с зарплатной вилкой.</p>
          <div className="hero-actions"><button className="button primary" onClick={() => onStart()}>Попробовать<ArrowUpRight size={19} /></button><a href="#possibilities" className="text-link">Как это работает<ArrowDown size={15} /></a></div>
        </motion.div>
        <div className="hero-bottom"><a href="#possibilities" aria-label="Прокрутить к возможностям"><ArrowDown size={18} /></a></div>
      </section>
      <motion.section {...reveal} id="possibilities" className="showcase section-pad" aria-labelledby="showcaseTitle">
        <div className="section-heading"><h2 id="showcaseTitle">Сначала навыки.<br /><span className="text-muted">Затем знакомство.</span></h2></div>
        <div className="showcase-browser"><div className="showcase-toolbar"><div className="browser-dots" aria-hidden="true"><i /><i /><i /></div><span className="mini-brand" aria-hidden="true">p</span><span className="showcase-label">Демо</span></div>
          <div className="showcase-body"><aside className="showcase-rail" aria-label="Примеры кабинетов">
            {variants.map((label, index) => <button key={label} className={variant === index ? 'selected' : ''} aria-label={label} aria-pressed={variant === index} onClick={() => setVariant(index)}><span>0{index + 1}</span><PlatformPreview variant={index} compact /></button>)}
          </aside><div className="showcase-main"><div className="demo-stage"><motion.div key={variant} initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3 }}><PlatformPreview variant={variant} onStart={onStart} /></motion.div></div><div className="showcase-status" aria-hidden="true"><span>0{variant + 1} / 03</span></div></div></div>
        </div>
        <div className="variant-switch" role="group" aria-label="Выбор примера">{variants.map((label, index) => <button key={label} onClick={() => setVariant(index)} className={variant === index ? 'active' : ''} aria-pressed={variant === index}>{index === 0 ? <Search size={16} /> : index === 1 ? <BadgeCheck size={16} /> : <UsersRound size={16} />}{label}</button>)}</div>
      </motion.section>
      <section className="workflow section-pad" id="how">
        <motion.div {...reveal} className="section-heading"><h2>От профиля<br />до предложения.</h2></motion.div>
        <div className="workflow-grid">{[
          { number: '01', title: 'Заполните профиль.', text: 'Специализация, стек и опыт.', Icon: FileSliders, className: 'import-visual' },
          { number: '02', title: 'Подтвердите уровень.', text: 'Тест формирует вашу категорию.', Icon: Layers3, className: 'layers-visual' },
          { number: '03', title: 'Получите предложение.', text: 'Условия и зарплата известны заранее.', Icon: CheckCheck, className: 'audit-visual' },
        ].map((step, index) => <motion.article {...reveal} transition={{ duration: reduced ? 0 : .5, delay: reduced ? 0 : index * .08 }} key={step.number}>
          <div className={'workflow-visual ' + step.className} aria-hidden="true">
            {index === 0 ? <><div className="file-object"><BadgeCheck size={50} /><i /><i /></div><div className="file-object second"><i /><i /><i /></div></> : index === 1 ? <div className="stack-object"><i /><i /><i><span>p</span></i></div> : <div className="audit-object"><span><Check size={16} /><i /></span><span><Check size={16} /><i /></span><span><Check size={16} /><i /></span><b><CheckCheck size={32} /></b></div>}
          </div><div className="workflow-step"><span>{step.number}</span><step.Icon /></div><h3>{step.title}</h3><p>{step.text}</p>
        </motion.article>)}</div>
      </section>
      <section id="try" className="create-section section-pad"><motion.div {...reveal} className="create-inner">
        <div className="create-title"><h2>Кто нужен<br /><span>вашей команде?</span></h2></div>
        <div className="brief-area"><form onSubmit={submit}><label className="sr-only" htmlFor="brief">Кого вы ищете?</label>
          <textarea ref={briefInput} id="brief" rows={4} maxLength={2000} value={brief} onChange={event => setBrief(event.target.value)} placeholder="Frontend · Middle · React…" required />
          <div className="brief-toolbar"><label className="count-select" htmlFor="direction"><UsersRound size={17} /><select id="direction" value={direction} onChange={event => setDirection(event.target.value)} aria-label="Направление поиска"><option value="">Направление</option><option>Frontend</option><option>Backend</option></select></label><button className="button ink" type="submit">Попробовать<ArrowUpRight size={18} /></button></div>
        </form><div className="prompt-examples">{examples.map(example => <button type="button" key={example.title} onClick={() => { setBrief(example.brief); setDirection(''); briefInput.current?.focus(); }}><Plus size={13} />{example.title}</button>)}</div></div>
      </motion.div></section>
      <section className="faq section-pad" aria-labelledby="faqTitle"><h2 id="faqTitle">Пара деталей.</h2><div>
        {[
          ['Как определяется грейд?', 'По результату тестирования на выбранный уровень. Самооценка в резюме не меняет подтверждённую категорию.'],
          ['Нужны достижения ФСП?', 'Участвовать можно и без истории ФСП. Достижения дополняют профиль, но не заменяют тест.'],
          ['Когда откроются контакты?', 'После принятия приглашения, только той компании, чьё предложение принято.'],
          ['Обязательно публиковать вакансию?', 'Нет. Компания может найти кандидата и отправить персональное приглашение с зарплатной вилкой.'],
        ].map(([question, answer]) => <details key={question}><summary>{question}<Plus size={19} /></summary><p>{answer}</p></details>)}
      </div></section>
    </main>
    <footer className="footer section-pad">
      <a className="footer-wordmark" href="/" aria-label="predel — главная">predel<span>↗</span></a>
      <div className="landing-partners"><img src="/brand/fsp.png" alt="Федерация спортивного программирования России" /><img src="/brand/partners.png" alt="Проект мэра Москвы, Бизнес Москвы, Развитие человеческого капитала, Лидеры цифровой трансформации" /></div>
      <div className="footer-bottom"><span>© 2026 predel</span><a href="/privacy" target="_blank" rel="noopener noreferrer">Конфиденциальность</a><a href="#main">Наверх<ArrowRight size={14} /></a></div>
    </footer>
  </div>;
}

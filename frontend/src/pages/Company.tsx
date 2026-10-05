import { Building2, type LucideIcon } from 'lucide-react';
import type { FormEvent } from 'react';
import type { PlatformState } from '../model';

export function FormHeader({ title, Icon }: { title: string; Icon: LucideIcon }) {
  return <div className="form-header"><div className="form-icon"><Icon size={22} /></div><h2>{title}</h2></div>;
}

export function Company({ state, update, notify }: {
  state: PlatformState; update: (fn: (state: PlatformState) => PlatformState) => void; notify: (message: string) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const name = String(fields.get('name')).trim();
    const contact = String(fields.get('contact')).trim();
    if (!name || !contact) return;
    update(previous => ({ ...previous, company: {
      ...previous.company, name, contact,
      industry: String(fields.get('industry')).trim(),
      website: String(fields.get('website')).trim(),
      description: String(fields.get('description')).trim(),
    } }));
    notify('Профиль компании сохранён');
  }
  return <><div className="page-heading"><h1>Компания</h1></div><form className="panel form-panel" onSubmit={submit}>
    <FormHeader title="Профиль компании" Icon={Building2} />
    <div className="form-grid"><label className="field"><span>Название</span><input name="name" required maxLength={100} defaultValue={state.company.name} /></label><label className="field"><span>Направление</span><input name="industry" maxLength={100} defaultValue={state.company.industry} /></label></div>
    <div className="form-grid"><label className="field"><span>Сайт</span><input name="website" type="url" defaultValue={state.company.website} /></label><label className="field"><span>Контактный email</span><input name="contact" type="email" required defaultValue={state.company.contact} /></label></div>
    <label className="field"><span>О компании</span><textarea name="description" rows={4} maxLength={3000} defaultValue={state.company.description} /></label>
    <div className="form-actions"><button className="button primary" type="submit">Сохранить</button></div>
  </form></>;
}

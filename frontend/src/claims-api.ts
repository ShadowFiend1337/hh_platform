import { integrationRequest } from './integrations-api';
export { integrationRequest as claimRequest };
export interface PublicRecord { id:string; sourceId:string; participantName:string; title:string; occurredOn:string; place:number|null; solvedTasks:number|null; completionTime:number|null; region:string|null; sourceUrl:string; sourcePage:number|null;
  provider?:string; publisher?:string; sourceKind?:'pdf'|'table'|'news'; dateBasis?:'event'|'publication'; participation?:'individual'|'team'; result?:string; excerpt?:string; sourceStatus?:string }
export interface PublicSource {id:string;publisher:string;title:string;sourceUrl:string;sourceKind:string;status:string;recordCount:number;lastSuccessAt:string|null;lastError:string|null;activeJob:{id:string;status:string}|null}
export const publicRecordUrl=(record:PublicRecord)=>record.sourceUrl+(record.sourcePage?'#page='+record.sourcePage:'');
export interface AchievementClaim {
  id:string; recordId:string; status:'pending'|'needs_info'|'approved'|'rejected'|'withdrawn'|'revoked'; version:number;
  candidateName:string; currentCandidateName?:string; record:PublicRecord; statement:string; links:string[];
  document:{name:string;mediaType:string;size:number;sha256:string}|null; createdAt:string; updatedAt:string; reviewedAt:string|null; validUntil:string|null;
  decisionNote:string|null; verificationMethod:string|null; verificationReference?:string|null; active:boolean;
  checks:{sourceStatus:string;nameMatch:boolean|null;duplicateApproved:boolean;documentProvided:boolean;recommendation:string;reasons:string[];ownershipAutomaticallyConfirmed:false};
  sourceCheck?:{status:string;checkedAt:string}|null;
  audit?:{id:number;action:string;createdAt:string;version:number;actorId:string}[];
}
export const claimLabels:Record<AchievementClaim['status'],string>={pending:'На проверке',needs_info:'Нужно дополнить материалы',approved:'Одобрено',rejected:'Отклонено',withdrawn:'Отозвано кандидатом',revoked:'Подтверждение отозвано'};
export const checkLabels:Record<string,string>={source_changed:'Публичный результат изменился — нужна повторная сверка',source_missing:'Запись больше не найдена',source_unavailable:'Источник недоступен или проверка устарела',name_mismatch:'ФИО профиля отличается от публикации',already_linked:'Результат уже имеет одобренную привязку',supporting_materials_missing:'Нет подтверждающих материалов',team_membership_required:'Нужно подтвердить участие кандидата в составе команды'};
export async function encodeDocument(file:File) {
  if(file.size>2_000_000) throw new Error('Файл должен быть не более 2 МБ.');
  if(!['application/pdf','image/png','image/jpeg'].includes(file.type)) throw new Error('Допустимы PDF, PNG и JPEG.');
  const dataBase64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('Не удалось прочитать файл.'));reader.readAsDataURL(file);});
  return {name:file.name,mediaType:file.type,dataBase64};
}

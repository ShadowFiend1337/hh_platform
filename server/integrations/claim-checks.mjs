import { createHash } from 'node:crypto';
export const digestRecord = record => createHash('sha256').update(JSON.stringify([
  record.id,record.participantName,record.place,record.solvedTasks,record.completionTime,record.region,
  record.participation,record.role,record.title,record.discipline,record.occurredOn,record.sourceUrl,record.documentHash,
  record.provider,record.result,record.nomination,record.dateBasis,record.excerpt,
])).digest('hex');
export const normalizedName = name => String(name).normalize('NFKC').trim().toLocaleLowerCase('ru-RU').replace(/ё/gu,'е').split(/\s+/u).sort().join(' ');
export function evaluateClaim({ snapshot, current, candidateName, duplicateApproved = false, documentProvided = false, catalogUnavailable = false }) {
  const sourceStatus = catalogUnavailable ? 'unavailable' : !current ? 'missing' : digestRecord(snapshot) === digestRecord(current) ? 'matched' : 'changed';
  const team=snapshot.participation==='team';
  const nameMatch = team ? null : normalizedName(candidateName) === normalizedName(snapshot.participantName);
  const reasons = [];
  if (sourceStatus !== 'matched') reasons.push('source_' + sourceStatus);
  if (team) reasons.push('team_membership_required');
  else if (!nameMatch) reasons.push('name_mismatch');
  if (duplicateApproved) reasons.push('already_linked');
  if (!documentProvided) reasons.push('supporting_materials_missing');
  return { version: snapshot.provider==='public-achievements'?'public-claim-checks-v1':'fsp-claim-checks-v1', sourceStatus, nameMatch, duplicateApproved, documentProvided,
    recommendation: sourceStatus !== 'matched' || duplicateApproved ? 'blocked' : !documentProvided ? 'request_information' : 'manual_review',
    reasons, ownershipAutomaticallyConfirmed: false };
}

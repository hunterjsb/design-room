export const boardTypes=['freeform','kanban','document','questionnaire','bugs'] as const;
export type BoardType=typeof boardTypes[number];
export const boardTypeLabels={freeform:'Freeform',kanban:'Kanban',document:'Document',questionnaire:'Questionnaire',bugs:'Bug tracker'};
export function legacyBoardType(id:string):BoardType{return id==='roadmap'?'kanban':id==='releases'?'document':'freeform'}
export function headingSlug(text:string){return text.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu,'').trim().replace(/\s+/g,'-')}

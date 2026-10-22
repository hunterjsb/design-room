import {createHash} from 'node:crypto';
import {answerFingerprintSource,bugFingerprintSource} from '../lib/questionnaire';
import {z} from 'zod';
import type {Board} from '../lib/board';
import {boardIdSchema,HttpError,type Entry} from './model';
export const answerReviewSchema=z.object({requestId:z.string().uuid(),boardId:boardIdSchema,revision:z.number().int().nonnegative(),questionIds:z.array(z.string().min(1).max(100)).min(1).max(20)});
export const bugReviewSchema=z.object({kind:z.literal('bug'),requestId:z.string().uuid(),boardId:boardIdSchema,revision:z.number().int().nonnegative(),bugIds:z.array(z.string().min(1).max(100)).length(1)});
export const submitReviewSchema=z.union([answerReviewSchema.extend({kind:z.literal('answers').optional()}),bugReviewSchema]);
export type ReviewRouting={coordinator:string,copies:string[]};
export function routing(raw:any):ReviewRouting {const agent=z.string().regex(/^[A-Z][A-Z0-9_-]{0,39}$/);return z.object({coordinator:agent,copies:z.array(agent).max(10)}).parse(raw)}
export function reviewSnapshot(input:z.infer<typeof answerReviewSchema>,board:Board,info:Entry,revision:number,who:string,now:string,config:ReviewRouting){
 if(info.type!=='questionnaire')throw new HttpError(400,'Submit answers from a questionnaire.');
 if(input.revision!==revision)throw new HttpError(409,'The questionnaire changed. Save or reload before submitting.');
 if(new Set(input.questionIds).size!==input.questionIds.length)throw new HttpError(400,'Choose each question once.');
 const questions=input.questionIds.map(id=>{const n=board.nodes.find(n=>n.id===id);if(!n?.question?.ready||n.question.archived||!n.body.trim()||!n.question.answer.trim())throw new HttpError(400,'Only ready questions with a prompt and a nonblank answer can be submitted.');if(n.question.copyTo.some(a=>!config.copies.includes(a)))throw new HttpError(400,'A copied agent is not configured for this workspace.');return {id:n.id,title:n.title,prompt:n.body,answer:n.question.answer,kind:n.question.kind,source:n.question.source,copyTo:n.question.copyTo,reference:`[[board:${info.id}#${n.id}]]`}});
 return {kind:'answers' as const,id:input.requestId,boardId:info.id,boardTitle:info.title,revision,submittedBy:who,submittedAt:now,questions,recipients:[...new Set([config.coordinator,...questions.flatMap(q=>q.copyTo)])],coordinator:config.coordinator,policy:'These exact submitted answers record the submitting human’s decisions on these questions. Drafts and blanks are not decisions. This handoff is not an order or approval to build. Canonical documentation and task planning remain with the coordinator.'};
}
export type ReviewSnapshot=ReturnType<typeof reviewSnapshot>;
export function forRecipient(snapshot:ReviewSnapshot,recipient:string){return {...snapshot,questions:snapshot.questions.filter(q=>recipient===snapshot.coordinator||q.copyTo.includes(recipient))}}
export function checkHuman(user:{agent?:unknown}){if(user.agent)throw new HttpError(403,'Only a signed-in human can submit decisions or manage delivery.');}

export function answerFingerprint(question:Parameters<typeof answerFingerprintSource>[0]){return createHash('sha256').update(answerFingerprintSource(question)).digest('hex')}

export function bugSnapshot(input:z.infer<typeof bugReviewSchema>,board:Board,info:Entry,revision:number,who:string,now:string,config:ReviewRouting){
 if(info.type!=='bugs')throw new HttpError(400,'Submit reports from a bug tracker.');
 if(input.revision!==revision)throw new HttpError(409,'The bug tracker changed. Save or reload before submitting.');
 const bugs=input.bugIds.map(id=>{const n=board.nodes.find(n=>n.id===id);if(!n?.bug||!n.title.trim()||![n.bug.reproduction,n.bug.expected,n.bug.actual,n.bug.environment].every(s=>s.trim()))throw new HttpError(400,'Add a title, reproduction steps, expected and actual behavior, and environment before submitting.');return {id:n.id,title:n.title,description:n.body,...n.bug,reference:`[[board:${info.id}#${n.id}]]`}});
 return {kind:'bug' as const,id:input.requestId,boardId:info.id,boardTitle:info.title,revision,submittedBy:who,submittedAt:now,questions:[] as never[],bugs,recipients:[config.coordinator],coordinator:config.coordinator,policy:'This human explicitly filed this bug for triage. Draft reports are not submissions. The coordinator triages and assigns it. This handoff does not authorize a build or change any board status; column changes require an explicit CAS-guarded write named in the coordinating event.'};
}
export function bugFingerprint(bug:Parameters<typeof bugFingerprintSource>[0]){return createHash('sha256').update(bugFingerprintSource(bug)).digest('hex')}

import {createHash} from 'node:crypto';
import {answerFingerprintSource} from '../lib/questionnaire';
import {z} from 'zod';
import type {Board} from '../lib/board';
import {boardIdSchema,HttpError,type Entry} from './model';
export const submitReviewSchema=z.object({requestId:z.string().uuid(),boardId:boardIdSchema,revision:z.number().int().nonnegative(),questionIds:z.array(z.string().min(1).max(100)).min(1).max(20)});
export type ReviewRouting={coordinator:string,copies:string[]};
export function routing(raw:any):ReviewRouting {const agent=z.string().regex(/^[A-Z][A-Z0-9_-]{0,39}$/);return z.object({coordinator:agent,copies:z.array(agent).max(10)}).parse(raw)}
export function reviewSnapshot(input:z.infer<typeof submitReviewSchema>,board:Board,info:Entry,revision:number,who:string,now:string,config:ReviewRouting){
 if(info.type!=='questionnaire')throw new HttpError(400,'Submit answers from a questionnaire.');
 if(input.revision!==revision)throw new HttpError(409,'The questionnaire changed. Save or reload before submitting.');
 if(new Set(input.questionIds).size!==input.questionIds.length)throw new HttpError(400,'Choose each question once.');
 const questions=input.questionIds.map(id=>{const n=board.nodes.find(n=>n.id===id);if(!n?.question?.ready||n.question.archived||!n.body.trim()||!n.question.answer.trim())throw new HttpError(400,'Only ready questions with a prompt and a nonblank answer can be submitted.');if(n.question.copyTo.some(a=>!config.copies.includes(a)))throw new HttpError(400,'A copied agent is not configured for this workspace.');return {id:n.id,title:n.title,prompt:n.body,answer:n.question.answer,kind:n.question.kind,source:n.question.source,copyTo:n.question.copyTo,reference:`[[board:${info.id}#${n.id}]]`}});
 return {id:input.requestId,boardId:info.id,boardTitle:info.title,revision,submittedBy:who,submittedAt:now,questions,recipients:[...new Set([config.coordinator,...questions.flatMap(q=>q.copyTo)])],coordinator:config.coordinator,policy:'These exact submitted answers record the submitting human’s decisions on these questions. Drafts and blanks are not decisions. This handoff is not an order or approval to build. Canonical documentation and task planning remain with the coordinator.'};
}
export type ReviewSnapshot=ReturnType<typeof reviewSnapshot>;
export function forRecipient(snapshot:ReviewSnapshot,recipient:string){return {...snapshot,questions:snapshot.questions.filter(q=>recipient===snapshot.coordinator||q.copyTo.includes(recipient))}}
export function checkHuman(user:{agent?:unknown}){if(user.agent)throw new HttpError(403,'Only a signed-in human can submit decisions or manage delivery.');}

export function answerFingerprint(question:Parameters<typeof answerFingerprintSource>[0]){return createHash('sha256').update(answerFingerprintSource(question)).digest('hex')}

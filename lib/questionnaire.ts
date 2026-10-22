export function answerFingerprintSource(question:{prompt:string,answer:string,source:string,copyTo:string[]}){return JSON.stringify([question.prompt,question.answer,question.source,[...question.copyTo].sort()]);}

export function bugFingerprintSource(bug:{title:string,description:string,severity:string,reproduction:string,expected:string,actual:string,environment:string}){return JSON.stringify([bug.title,bug.description,bug.severity,bug.reproduction,bug.expected,bug.actual,bug.environment]);}

export const initial = (id) => ({id,node:'start',money:10000,privacy:100,history:[],clues:[],ended:false});
export function act(state, scenario, choiceId) {
  if(state.ended) throw new Error('本局已经结束');
  const node=scenario.nodes[state.node], choice=node.choices.find(c=>c.id===choiceId);
  if(!choice) throw new Error('无效选项');
  return {...state,node:choice.next,ended:!scenario.nodes[choice.next],money:Math.max(0,state.money-(choice.loss||0)),privacy:Math.max(0,state.privacy-(choice.privacy||0)),history:[...state.history,{node:state.node,choice:choice.id,label:choice.text,lesson:choice.lesson,loss:choice.loss||0,privacy:choice.privacy||0}]};
}
export function reviewDate(level, now=Date.now()) { return now+[1,3,7,14,30][Math.min(4,Math.max(0,level))]*86400000; }
export function score(s){return Math.max(0,100-s.history.reduce((n,h)=>n+(h.loss?25:0)+(h.privacy?20:0),0));}

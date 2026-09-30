(function (root) {
  'use strict';
  const abilities = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
  const skills = {Acrobatics:'dexterity', 'Animal Handling':'wisdom', Arcana:'intelligence', Athletics:'strength', Deception:'charisma', History:'intelligence', Insight:'wisdom', Intimidation:'charisma', Investigation:'intelligence', Medicine:'wisdom', Nature:'intelligence', Perception:'wisdom', Performance:'charisma', Persuasion:'charisma', Religion:'intelligence', 'Sleight of Hand':'dexterity', Stealth:'dexterity', Survival:'wisdom'};
  const conditions = ['Blinded','Charmed','Deafened','Frightened','Grappled','Incapacitated','Invisible','Paralyzed','Petrified','Poisoned','Prone','Restrained','Stunned','Unconscious'];
  const classes = {Barbarian:'d12', Bard:'d8', Cleric:'d8', Druid:'d8', Fighter:'d10', Monk:'d8', Paladin:'d10', Ranger:'d10', Rogue:'d8', Sorcerer:'d6', Warlock:'d8', Wizard:'d6'};
  const integer = (value, fallback=0) => Number.isFinite(Number(value)) && value !== '' && value != null ? Math.trunc(Number(value)) : fallback;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, integer(value)));
  const modifier = score => Math.floor((integer(score,10)-10)/2);
  const proficiency = level => 2 + Math.floor((clamp(level,1,20)-1)/4);
  const signed = value => (value >= 0 ? '+' : '') + value;
  const skillKey = name => name.toLowerCase().replaceAll(' ', '_');
  function die(sides) {
    // Rejection sampling avoids modulo bias; never evaluate a dice string as code.
    const limit = Math.floor(4294967296 / sides) * sides;
    const values = new Uint32Array(1);
    do { root.crypto.getRandomValues(values); } while(values[0] >= limit);
    return values[0] % sides + 1;
  }
  function roll(expression, mode='normal', random=die) {
    const text = String(expression).replace(/\s/g,'').toLowerCase();
    if (!text || text.length > 100 || !/^[+-]?(?:\d*d(?:4|6|8|10|12|20|100)|\d+)(?:[+-](?:\d*d(?:4|6|8|10|12|20|100)|\d+))*$/.test(text)) throw new Error('Use dice such as 1d20 + 5 or 2d6 + 1d4 + 3 (up to 100 dice).');
    const terms = text.match(/[+-]?[^+-]+/g);
    const parsed = terms.map(term => { const sign=term[0]==='-'?-1:1, body=term.replace(/^[+-]/,''); const [count,sides]=body.split('d'); return sides ? {sign,count:integer(count,1)||1,sides:Number(sides)} : {sign,value:Number(body)}; });
    if (parsed.some(t => t.sides && /^0+d/.test(terms[parsed.indexOf(t)].replace(/^[+-]/,''))) || parsed.reduce((n,t)=>n+(t.count||0),0)>100 || parsed.some(t=>t.value>1000000)) throw new Error('Use 1–100 dice and modifiers up to 1,000,000.');
    if (!['normal','advantage','disadvantage'].includes(mode)) throw new Error('Unknown roll mode.');
    const diceTerms = parsed.filter(t=>t.sides);
    if(mode!=='normal' && (diceTerms.length!==1 || diceTerms[0].sides!==20 || diceTerms[0].count!==1 || diceTerms[0].sign!==1)) throw new Error('Advantage and disadvantage require one d20, with optional modifiers.');
    let total=0, natural=null;
    const breakdown=[];
    parsed.forEach(t=>{
      if(!t.sides){total+=t.sign*t.value;breakdown.push(signed(t.sign*t.value));return;}
      const rolls=Array.from({length:mode!=='normal'?2:t.count},()=>random(t.sides));
      const result=mode==='advantage'?Math.max(...rolls):mode==='disadvantage'?Math.min(...rolls):rolls.reduce((a,b)=>a+b,0);
      if(diceTerms.length===1 && t.sides===20 && t.count===1) natural=result;
      total+=t.sign*result;
      breakdown.push(`${t.sign<0?'-':''}${t.count}d${t.sides} [${rolls.join(', ')}]${mode!=='normal'?' → '+result:''}`);
    });
    return {expression:text,total,natural,breakdown:breakdown.join(' · '),mode};
  }
  function damage(state, amount) {
    const hp=clamp(state.hp_current,0,state.hp_max), temp=clamp(state.hp_temporary,0,999999), loss=clamp(amount,0,999999);
    return {hp_current:Math.max(0,hp-Math.max(0,loss-temp)),hp_temporary:Math.max(0,temp-loss)};
  }
  const rules={abilities,skills,conditions,classes,integer,clamp,modifier,proficiency,signed,skillKey,roll,damage};
  if(typeof module!=='undefined' && module.exports) module.exports=rules;
  root.TabletopRules=rules;
})(typeof globalThis!=='undefined'?globalThis:window);

import { normalizeExplainEvent } from '../explain-event-context';
test('keeps declared context without turning the description into a diagnosis', () => {
  const result = normalizeExplainEvent({eventId:'E1', eventType:'CUSTOM_ALERT', title:'Test', startTime:10, endTime:20,
    properties:[{key:'daybreak.test',value:'true'},{key:'daybreak.test.scenario',value:'latency'},
      {key:'dt.event.description',value:'Producer suspects a timeout'}, {key:'deployment.version',value:'v2'}]});
  expect(result).toMatchObject({id:'E1', synthetic:true, provenance:'event-declaration',description:'Producer suspects a timeout'});
  expect(result).not.toHaveProperty('diagnosis'); expect(result).not.toHaveProperty('cause');
});
test('rejects sensitive keys and expurgates credentials even in allowed fields', () => {
  const result = normalizeExplainEvent({title:'Bearer hidden',description:'https://user:password@example.com', properties:[
    {key:'daybreak.test.context.token',value:'hidden'}, {key:'daybreak.test.expected',value:'cause'},
    {key:'context',value:'https://example.com?token=hidden'}, {key:'app',value:'dt0c01.fake.secret'},
    {key:'observations',value:'https%3A%2F%2Fu%3Ap%40example.com'}, {key:'random',value:'hidden'}]});
  expect(result.description).toBe('[expurgé]'); expect(result.title).toBe('[expurgé]');
  expect(result.properties).toHaveLength(3); expect(result.properties.every(p=>p.value==='[expurgé]')).toBe(true);
  expect(JSON.stringify(result)).not.toContain('hidden');
});
test('ignores inherited, malformed, getter and prototype properties', () => {
  const property = Object.create({key:'daybreak.test',value:'true'});
  const getter = {key:'context', get value(){throw new Error('must not execute');}};
  const result = normalizeExplainEvent({properties:[property,getter,{key:'__proto__',value:'x'},null,{key:'context',value:{secret:'x'}}]});
  expect(result.properties).toEqual([]); expect(result.synthetic).toBe(false);
  expect(normalizeExplainEvent(Object.create({title:'inherited'})).title).toBe('');
});
test('bounds declarations and never guesses synthetic status from title or scenario', () => {
  const result = normalizeExplainEvent({title:'synthetic test '.repeat(100),description:'a'.repeat(3000),startTime:NaN,endTime:-1,
    properties:[{key:'daybreak.test.scenario',value:'synthetic'}, ...Array.from({length:40},(_,i)=>({key:'context.'+i,value:'b'.repeat(2000)}))]});
  expect(result.synthetic).toBe(false); expect(result.title).toHaveLength(500); expect(result.description).toHaveLength(2000);
  expect(result.properties).toHaveLength(20); expect(result.properties[1].value).toHaveLength(1000);
  expect(result.startTime).toBeNull(); expect(result.endTime).toBeNull();
});

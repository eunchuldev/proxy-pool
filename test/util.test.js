const {
  DefaultDict,
  sleep,
  AsyncPriorityQueue,
} = require("../util.js");

it("async priority queue", async () => {
  let q = new AsyncPriorityQueue([3,1]);
  q.push(2);
  expect(await q.pop()).toEqual(1);
  expect(await q.pop()).toEqual(2);
  expect(await q.pop()).toEqual(3);
  let a = (async () => {
    expect(await q.pop()).toEqual(4);
  })();
  let b = (async () => {
    expect(await q.pop()).toEqual(5);
  })();
  q.push(4);
  q.push(5);
  await a;
  await b;
  q.push(3);
  q.push(2);
  q.push(1);
  expect([...q.iterator()]).toEqual([1,3,2]);
  q.remove(1);
  expect([...q.iterator()]).toEqual([1,2]);
});

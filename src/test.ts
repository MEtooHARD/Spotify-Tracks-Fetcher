import { ExploreStack } from "./helpers";

const stack = new ExploreStack();

for (let i = 0; i < 10; i++) {
    stack.add(`item-${i}`);
}


for (let i = 0; i < 5; i++) {
    console.log(stack.pop())
}

console.log('---');

for (let i = 10; i < 15; i++) {
    stack.add(`item-${i}`);
}

for (let i = 0; i < 15; i++) {
    console.log(stack.pop())
}

console.log('---');

for (let i = 0; i < 10; i++) {
    stack.add(`item-${i}`);
}

for (let i = 0; i < 5; i++) {
    console.log(stack.pop())
}
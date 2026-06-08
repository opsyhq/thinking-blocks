import type { FoodInput } from "./block"

// A handful of orders to put through the line. The catalog isn't this list. The
// catalog is every food there is; these are just the parts we ask for first. Add
// "ramen", "a flat white", "deep-dish pizza slice" and the machines will make
// those too, no code change.
export const FOODS: FoodInput[] = [
	{ food: "banana" },
	{ food: "dragon fruit" },
	{ food: "deep-dish pizza slice" },
]

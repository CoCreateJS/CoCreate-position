import observer from "@cocreate/observer";
import { queryElements } from "@cocreate/utils";
import position from "./position";
import "./index.css";

const positionTriggers = new WeakSet();

function init() {
	let elements = document.querySelectorAll("[moveable], [positionable]");
	initElements(elements);
	initPositionTriggers(document.querySelectorAll("[position-query]"));
}

function initElements(elements) {
	for (let element of elements) initElement(element);
}

function initElement(element) {
	if (!element.position)
		element.position = new position(element, element.parentElement);
}

function initPositionTriggers(elements) {
	for (const trigger of elements) {
		if (positionTriggers.has(trigger)) continue;
		positionTriggers.add(trigger);
		trigger.addEventListener("click", () => {
			requestAnimationFrame(() => {
				const targets = queryElements({ element: trigger, prefix: "position" });
				const anchors = queryElements({ element: trigger, prefix: "position-anchor" });
				const anchor = anchors[0] || trigger;
				for (const target of targets) {
					initElement(target);
					target.position.place(anchor);
				}
			});
		});
	}
}

observer.init({
	name: "positionAddedNodes",
	types: ["addedNodes"],
	selector: "[moveable], [positionable]",
	callback: (mutation) => {
		initElement(mutation.target);
	}
});

observer.init({
	name: "positionQueryAddedNodes",
	types: ["addedNodes", "attributes"],
	selector: "[position-query]",
	attributeFilter: ["position-query"],
	callback: (mutation) => {
		initPositionTriggers([mutation.target]);
	}
});

observer.init({
	name: "positionAttributes",
	types: ["attributes"],
	attributeFilter: ["moveable", "positionable"],
	callback: (mutation) => {
		initElement(mutation.target);
	}
});

init();

export default position;

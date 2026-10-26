import observer from "@cocreate/observer";
import Position from "./draggable/engine.js";

const selector = "[draggable]";

export function initElement(element, options = {}) {
	if (!element?.matches) return;
	const draggable = options.draggable ?? element.matches(selector);
	const previous = element.position;
	const dragScope = options.dragScope || null;

	if (!previous?._positionController) {
		const position = new Position(element, element.parentElement, {
			draggable,
			dragScope,
			delegated: options.delegated
		});
		if (previous?.place) position.place = previous.place;
		if (previous?.unplace) position.unplace = previous.unplace;
		position._positionController = true;
		element.position = position;
	} else {
		previous.options.draggable = draggable;
		previous.options.dragScope = dragScope;
		if (draggable && !options.delegated && previous.options.delegated) {
			previous.options.delegated = false;
			previous._initEvent();
		}
	}
	return element.position;
}

export function initElements(elements) {
	for (const element of elements) initElement(element);
}

function refresh(node) {
	if (node.nodeType !== 1) return;
	if (node.matches(selector)) initElement(node);
	initElements(node.querySelectorAll(selector));
}

export function init() {
	initElements(document.querySelectorAll(selector));
}

observer.init({
	name: "positionDraggableAddedNodes",
	types: ["addedNodes"],
	selector,
	callback: mutation => refresh(mutation.target)
});

observer.init({
	name: "positionDraggableAttributes",
	types: ["attributes"],
	attributeFilter: ["draggable"],
	selector,
	callback: mutation => initElement(mutation.target)
});

init();

export default { init, initElement, initElements };

import observer from "@cocreate/observer";
import { queryElements } from "@cocreate/utils";
import position from "./position";
import "./index.css";

const positionTriggers = new WeakSet();
const directDragSelector = "[draggable]";
const positionScopeSelector = [
	"[droppable-query][draggable-query]",
	"[droppable-query][clonable-query]",
	"[snappable-query][draggable-query]",
	"[snappable-query][clonable-query]"
].join(", ");
const positionElementSelector = `${directDragSelector}, [position-target]`;

function init() {
	initElements(document.querySelectorAll(positionElementSelector));
	initPositionScopes(document.querySelectorAll(positionScopeSelector));
	initPositionTriggers(document.querySelectorAll("[position-query]"));
}

function initElements(elements) {
	for (const element of elements) initElement(element);
}

function initElement(element, options = {}) {
	if (!element?.matches) return;
	const draggable = options.draggable ?? element.matches(directDragSelector);
	const dragScope = options.dragScope || null;

	if (!element.position) {
		element.position = new position(element, element.parentElement, {
			draggable,
			dragScope,
			delegated: options.delegated
		});
	} else {
		element.position.options.draggable = draggable;
		element.position.options.dragScope = dragScope;
		if (draggable && !options.delegated && element.position.options.delegated) {
			element.position.options.delegated = false;
			element.position._initEvent();
		}
	}
}

function initPositionScopes(scopes) {
	for (const scope of scopes) {
		const matchesScope = scope.matches(positionScopeSelector);
		if (scope.positionDragDelegation && matchesScope) continue;
		if (scope.positionDragDelegation) {
			scope.removeEventListener("mousedown", scope.positionDragDelegation);
			scope.removeEventListener("touchstart", scope.positionDragDelegation);
			scope.positionDragDelegation = null;
		}
		if (!matchesScope) continue;

		const startDrag = (event) => {
			if (event.__positionHandled) return;
			const draggableQuery = scope.getAttribute("draggable-query");
			const clonableQuery = scope.getAttribute("clonable-query");
			if (!draggableQuery && !clonableQuery) return;
			const draggableMatches = new Set(draggableQuery
				? queryElements({ element: scope, selector: draggableQuery })
				: []);
			const clonableMatches = new Set(clonableQuery
				? queryElements({ element: scope, selector: clonableQuery })
				: []);
			let element = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
			while (element && element !== scope &&
				!draggableMatches.has(element) && !clonableMatches.has(element))
				element = element.parentElement;
			if (!element || element === scope ||
				(!draggableMatches.has(element) && !clonableMatches.has(element))) return;
			// If both queries match, cloning takes precedence so the source is preserved.
			const dragType = clonableMatches.has(element) ? "clonable" : "draggable";

			if (!element.position)
				initElement(element, { draggable: true, dragScope: scope, dragType, delegated: true });
			element.position.options.draggable = true;
			element.position.options.dragScope = scope;
			element.position.options.delegated = true;
			element.position.options.dragType = dragType;
			event.__positionDelegated = true;
			event.__positionHandled = true;
			element.position._handlePointerDown(event);
		};
		scope.positionDragDelegation = startDrag;
		scope.addEventListener("mousedown", startDrag);
		scope.addEventListener("touchstart", startDrag, { passive: false });
	}
}

function initPositionTriggers(elements) {
	for (const trigger of elements) {
		if (positionTriggers.has(trigger)) continue;
		positionTriggers.add(trigger);
		trigger.addEventListener("click", () => {
			requestAnimationFrame(() => {
				const targets = queryElements({ element: trigger, prefix: "position" });
				const options = {};
				for (const [option, attribute] of [
					["position", "position"],
					["offset", "position-offset"],
					["padding", "position-padding"],
					["collision", "position-collision"]
				]) {
					if (trigger.hasAttribute(attribute))
						options[option] = trigger.getAttribute(attribute);
				}
				for (const target of targets) {
					initElement(target);
					target.hidden = false;
					target.position.place(trigger, options);
				}
			});
		});
	}
}

function refreshNode(node) {
	if (node.nodeType !== 1) return;
	if (node.matches(positionElementSelector)) initElement(node);
	if (node.matches(positionScopeSelector)) initPositionScopes([node]);
	initElements(node.querySelectorAll(positionElementSelector));
	initPositionScopes(node.querySelectorAll(positionScopeSelector));
	initPositionTriggers(node.matches("[position-query]") ? [node] : []);
	initPositionTriggers(node.querySelectorAll("[position-query]"));
}

observer.init({
	name: "positionAddedNodes",
	types: ["addedNodes"],
	selector: `${positionElementSelector}, ${positionScopeSelector}, [position-query]`,
	callback: (mutation) => refreshNode(mutation.target)
});

observer.init({
	name: "positionAttributes",
	types: ["attributes"],
	attributeFilter: ["draggable", "position-target", "draggable-query", "clonable-query", "droppable-query", "snappable-query"],
	selector: "[draggable], [position-target], [draggable-query], [clonable-query], [droppable-query], [snappable-query]",
	callback: (mutation) => {
		const element = mutation.target;
		if (["draggable", "position-target"].includes(mutation.attributeName))
			initElement(element);
		if (element.matches(positionScopeSelector) ||
			mutation.attributeName === "draggable-query" ||
			mutation.attributeName === "clonable-query" ||
			mutation.attributeName === "droppable-query" ||
			mutation.attributeName === "snappable-query") {
			initPositionScopes([element]);
		}
	}
});

observer.init({
	name: "positionTriggerAttributes",
	types: ["attributes"],
	attributeFilter: ["position-query"],
	callback: (mutation) => initPositionTriggers([mutation.target])
});

init();

export default position;

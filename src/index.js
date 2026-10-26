import observer from "@cocreate/observer";
import { queryElements } from "@cocreate/utils";
import position from "./position";
import "./index.css";

const directDragSelector = "[draggable]";
const positionScopeSelector = "[droppable-query][draggable-query], [droppable-query][clonable-query]";
const positionElementSelector = `${directDragSelector}, [position-target]`;

function init() {
	initElements(document.querySelectorAll(positionElementSelector));
	initPositionScopes(document.querySelectorAll(positionScopeSelector));
	initPositionQueries(document.querySelectorAll("[position-query]"));
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
		if (scope.positionDragDelegation) {
			scope.removeEventListener("mousedown", scope.positionDragDelegation);
			scope.removeEventListener("touchstart", scope.positionDragDelegation);
			scope.positionDragDelegation = null;
		}
		if (!scope.matches(positionScopeSelector)) continue;

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

function initPositionQueries(elements) {
	for (const element of elements) {
		initElement(element);
		const anchor = queryElements({ element, prefix: "position" })[0];
		if (anchor && anchor !== element)
			element.position.place(anchor);
		else
			element.position.unplace();
	}
}

function refreshNode(node) {
	if (node.nodeType !== 1) return;
	if (node.matches(positionElementSelector)) initElement(node);
	if (node.matches(positionScopeSelector)) initPositionScopes([node]);
	initElements(node.querySelectorAll(positionElementSelector));
	initPositionScopes(node.querySelectorAll(positionScopeSelector));
	initPositionQueries(node.matches("[position-query]") ? [node] : []);
	initPositionQueries(node.querySelectorAll("[position-query]"));
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
	attributeFilter: ["draggable", "position-target", "draggable-query", "clonable-query", "droppable-query"],
	selector: "[draggable], [position-target], [draggable-query], [clonable-query], [droppable-query]",
	callback: (mutation) => {
		const element = mutation.target;
		if (["draggable", "position-target"].includes(mutation.attributeName))
			initElement(element);
		if (element.matches(positionScopeSelector) ||
			mutation.attributeName === "draggable-query" ||
			mutation.attributeName === "clonable-query" ||
			mutation.attributeName === "droppable-query") {
			initPositionScopes([element]);
		}
	}
});

observer.init({
	name: "positionPlacementAttributes",
	types: ["attributes"],
	attributeFilter: ["position-query", "position", "position-offset", "position-padding", "position-collision"],
	callback: (mutation) => {
		const element = mutation.target;
		if (element.hasAttribute("position-query"))
			initPositionQueries([element]);
		else if (mutation.attributeName === "position-query")
			element.position?.unplace();
	}
});

init();

export default position;

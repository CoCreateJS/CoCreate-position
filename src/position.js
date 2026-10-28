import observer from "@cocreate/observer";
import { dispatch } from "./helpers/events.js";

const placementStates = new WeakMap();
const triggerElements = new WeakMap();
const positionEventBindings = new WeakMap();
const positionConfigSelector = "[position-query], [position-element], [position-events], [position], [position-offset], [position-padding], [position-collision]";

function getQueryAttribute(element, name) {
	return element?.getAttributeNode?.(name)?.value ?? null;
}

export function initPositionTargets(elements) {
	for (const element of elements) attachPlacement(element);
}

function attachPlacement(element) {
	if (!element?.matches) return;
	const position = element.position || (element.position = {
		el: element,
		container: element.parentElement
	});
	position.el = element;
	position.place = (anchor = element, options = {}) => place(element, anchor, options);
	position.unplace = () => unplace(element);
}

function pointInDocument(point, sourceDocument, targetDocument) {
	if (!point || !sourceDocument) return null;
	let { x, y } = point;
	let document = sourceDocument;
	while (document !== targetDocument) {
		const frame = document.defaultView?.frameElement;
		if (!frame) return null;
		const rect = frame.getBoundingClientRect();
		const scaleX = frame.offsetWidth ? rect.width / frame.offsetWidth : 1;
		const scaleY = frame.offsetHeight ? rect.height / frame.offsetHeight : 1;
		x = rect.left + (frame.clientLeft + x) * scaleX;
		y = rect.top + (frame.clientTop + y) * scaleY;
		document = frame.ownerDocument;
	}
	return { x, y };
}

function getCursorPoint(event, targetDocument) {
	const point = event?.detail?.cursor ||
		(Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY)
			? { x: event.clientX, y: event.clientY }
			: null);
	const sourceDocument = event?.detail?.document ||
		(event?.currentTarget?.nodeType === 9
			? event.currentTarget
			: event?.currentTarget?.contentDocument || event?.currentTarget?.ownerDocument);
	return pointInDocument(point, sourceDocument, targetDocument);
}

function place(element, anchor, options = {}) {
	if (!anchor?.getBoundingClientRect) return;
	const anchorDocument = anchor.ownerDocument ||
		anchor.startContainer?.ownerDocument || anchor.commonAncestorContainer?.ownerDocument;
	if (!anchorDocument) return;
	let state = placementStates.get(element);
	if (!state) placementStates.set(element, state = {});
	state.options = options;
	if (state.anchor !== anchor) {
		unplace(element);
		state.anchor = anchor;
		state.document = anchorDocument;
		state.update = () => {
			if (state.frame) return;
			const view = anchorDocument.defaultView;
			state.frame = view.requestAnimationFrame(() => {
				state.frame = null;
				const currentAnchor = state.anchor;
				const isConnected = currentAnchor?.isConnected ??
					currentAnchor?.startContainer?.isConnected;
				if (isConnected) place(element, currentAnchor, state.options);
			});
		};
		anchorDocument.addEventListener("scroll", state.update, true);
		anchorDocument.defaultView?.addEventListener("resize", state.update);
	}

	const attribute = (name, fallback) => anchor.getAttribute?.(name) ?? fallback;
	const placement = options.position || options.placement || attribute("position", "bottom-start");
	const offset = Number(options.offset ?? attribute("position-offset", 8));
	const padding = Number(options.padding ?? attribute("position-padding", 8));
	const collision = (options.collision || attribute("position-collision", "flip shift")).split(/[\s,]+/);
	const tokens = String(placement).trim().toLowerCase().split(/[\s-]+/).filter(Boolean);
	const usesCursor = tokens.includes("cursor");
	const usesText = tokens.includes("text");
	const positionalTokens = tokens.filter(token => token !== "cursor" && token !== "text");
	let row = "bottom";
	let column = "center";
	let side = null;
	let sideAlign = "middle";
	if (["top", "middle", "bottom"].includes(positionalTokens[0])) {
		row = positionalTokens[0];
		column = ({ start: "left", end: "right" })[positionalTokens[1]] || positionalTokens[1] || "center";
	} else if (["left", "right"].includes(positionalTokens[0])) {
		side = positionalTokens[0];
		sideAlign = ({ start: "top", end: "bottom" })[positionalTokens[1]] || positionalTokens[1] || "middle";
	} else if (positionalTokens[0] === "center") {
		row = "middle";
		column = "center";
	}
	const cursorPoint = usesCursor ? options.cursorPoint : null;
	const anchorRect = cursorPoint
		? { left: cursorPoint.x, top: cursorPoint.y, right: cursorPoint.x, bottom: cursorPoint.y, width: 0, height: 0 }
		: (usesText && anchor.nodeType === 1 ? getTextRectInDocument(anchor, element.ownerDocument) : null) ||
			getRectInDocument(anchor, element.ownerDocument);
	if (!anchorRect) return;
	const elementRect = getFloatingRect(element);
	const container = element.parentElement;
	const parentRect = container?.getBoundingClientRect() || { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
	const view = element.ownerDocument.defaultView;
	const isFixed = view.getComputedStyle(element).position === "fixed";
	const boundary = isFixed
		? { left: 0, top: 0, right: view.innerWidth, bottom: view.innerHeight }
		: parentRect;
	const getCoordinates = (currentRow, currentSide = side) => {
		let left;
		let top;
		if (currentSide) {
			left = currentSide === "left"
				? anchorRect.left - elementRect.width - offset
				: anchorRect.right + offset;
			top = sideAlign === "top" ? anchorRect.top
				: sideAlign === "bottom" ? anchorRect.bottom - elementRect.height
					: anchorRect.top + (anchorRect.height - elementRect.height) / 2;
		} else {
			top = currentRow === "top" ? anchorRect.top - elementRect.height - offset
				: currentRow === "bottom" ? anchorRect.bottom + offset
					: anchorRect.top + (anchorRect.height - elementRect.height) / 2;
			left = column === "left" ? anchorRect.left
				: column === "right" ? anchorRect.right - elementRect.width
					: anchorRect.left + (anchorRect.width - elementRect.width) / 2;
		}
		return { left, top };
	};

	let coordinates = getCoordinates(row);
	if (collision.includes("flip")) {
		const opposite = { top: "bottom", bottom: "top", left: "right", right: "left" };
		const overflows =
			(!side && row === "top" && coordinates.top < boundary.top + padding) ||
			(!side && row === "bottom" && coordinates.top + elementRect.height > boundary.bottom - padding) ||
			(side === "left" && coordinates.left < boundary.left + padding) ||
			(side === "right" && coordinates.left + elementRect.width > boundary.right - padding);
		if (overflows) {
			if (side) side = opposite[side] || side;
			else row = opposite[row] || row;
			coordinates = getCoordinates(row);
		}
	}

	if (collision.includes("shift")) {
		coordinates.left = Math.min(Math.max(coordinates.left, boundary.left + padding),
			Math.max(boundary.left + padding, boundary.right - elementRect.width - padding));
		coordinates.top = Math.min(Math.max(coordinates.top, boundary.top + padding),
			Math.max(boundary.top + padding, boundary.bottom - elementRect.height - padding));
	}

	element.style.right = "auto";
	element.style.bottom = "auto";
	element.style.left = (isFixed ? coordinates.left : coordinates.left - parentRect.left + (container?.scrollLeft || 0)) + "px";
	element.style.top = (isFixed ? coordinates.top : coordinates.top - parentRect.top + (container?.scrollTop || 0)) + "px";
	if (element.position) element.position.isSnap = false;
	dispatch(element, "element-positioned");
}

function mapRectToDocument(rect, sourceDocument, targetDocument) {
	let document = sourceDocument;
	while (document !== targetDocument) {
		const frame = document.defaultView?.frameElement;
		if (!frame) return null;
		const frameRect = frame.getBoundingClientRect();
		const scaleX = frame.offsetWidth ? frameRect.width / frame.offsetWidth : 1;
		const scaleY = frame.offsetHeight ? frameRect.height / frame.offsetHeight : 1;
		rect = {
			left: frameRect.left + (frame.clientLeft + rect.left) * scaleX,
			top: frameRect.top + (frame.clientTop + rect.top) * scaleY,
			right: frameRect.left + (frame.clientLeft + rect.right) * scaleX,
			bottom: frameRect.top + (frame.clientTop + rect.bottom) * scaleY,
			width: rect.width * scaleX,
			height: rect.height * scaleY
		};
		document = frame.ownerDocument;
	}
	return rect;
}

function getRectInDocument(element, targetDocument) {
	const sourceDocument = element.ownerDocument ||
		element.startContainer?.ownerDocument || element.commonAncestorContainer?.ownerDocument;
	return mapRectToDocument(element.getBoundingClientRect(), sourceDocument, targetDocument);
}

function getFloatingRect(element) {
	const rect = element.getBoundingClientRect();
	if (rect.width > 0 && rect.height > 0) return rect;

	const view = element.ownerDocument.defaultView;
	const rects = [...element.querySelectorAll("*")]
		.filter(child => {
			const style = view.getComputedStyle(child);
			return style.display !== "none" && style.visibility !== "hidden";
		})
		.map(child => child.getBoundingClientRect())
		.filter(childRect => childRect.width > 0 || childRect.height > 0);
	if (!rects.length) return rect;

	const left = Math.min(...rects.map(childRect => childRect.left));
	const top = Math.min(...rects.map(childRect => childRect.top));
	const right = Math.max(...rects.map(childRect => childRect.right));
	const bottom = Math.max(...rects.map(childRect => childRect.bottom));
	return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function getTextRectInDocument(element, targetDocument) {
	const document = element.ownerDocument;
	const walker = document.createTreeWalker(element, document.defaultView.NodeFilter.SHOW_TEXT);
	let textNode;
	while ((textNode = walker.nextNode())) {
		const value = textNode.nodeValue || "";
		const offset = value.search(/\S/);
		if (offset < 0) continue;
		const characterLength = String.fromCodePoint(value.codePointAt(offset)).length;
		const range = document.createRange();
		range.setStart(textNode, offset);
		range.setEnd(textNode, offset + characterLength);
		const rect = range.getClientRects()[0];
		if (rect) return mapRectToDocument(rect, document, targetDocument);
	}
	return null;
}

function deepest(elements) {
	return elements.reduce((current, element) =>
		!current || current.contains(element) ? element : current, null);
}

function placeFromTrigger(trigger) {
	const anchorQuery = getQueryAttribute(trigger, "position-query");
	const elementQuery = getQueryAttribute(trigger, "position-element");
	const selectionOperator = anchorQuery?.match(/\$selection/);
	let anchor;
	if (selectionOperator) {
		const prefix = anchorQuery.slice(0, selectionOperator.index).trim();
		const sources = prefix ? trigger.queryElements({ selector: prefix }) : [trigger];
		anchor = sources.find(source => source.selection)?.selection || null;
	} else {
		const anchors = trigger.queryElements({ selector: anchorQuery });
		anchor = anchorQuery?.includes(":hover") ? deepest(anchors) : anchors[0];
	}
	const elements = trigger.queryElements({ selector: elementQuery });
	const previousElements = triggerElements.get(trigger) || new Set();
	const currentElements = new Set(elements);
	for (const element of previousElements) {
		if (!currentElements.has(element)) clearPlacement(element);
	}
	triggerElements.set(trigger, currentElements);
	if (!anchor || !elementQuery) {
		for (const element of currentElements) clearPlacement(element);
		return;
	}
	const options = {};
	for (const [option, attribute] of [
		["position", "position"],
		["offset", "position-offset"],
		["padding", "position-padding"],
		["collision", "position-collision"]
	]) {
		if (trigger.hasAttribute(attribute)) options[option] = trigger.getAttribute(attribute);
	}
	options.cursorPoint = trigger.positionCursorPoint;
	for (const element of elements) {
		attachPlacement(element);
		element.hidden = false;
		element.position.place(anchor, options);
	}
}

function clearPlacement(element) {
	if (!element) return;
	element.position?.unplace?.();
	element.hidden = true;
}

function schedulePositionUpdate(element, cursorPoint) {
	element.positionCursorPoint = cursorPoint;
	if (element.positionFrame) return;
	element.positionFrame = element.ownerDocument.defaultView.requestAnimationFrame(() => {
		element.positionFrame = null;
		placeFromTrigger(element);
	});
}

function initPositionEvents(element) {
	const value = getQueryAttribute(element, "position-events")?.trim() || "";
	const existing = positionEventBindings.get(element);
	const key = value;
	if (existing?.key === key) return;
	existing?.remove();
	const events = value.split(",").map(event => event.trim()).filter(Boolean);
	if (!events.length) {
		positionEventBindings.delete(element);
		return;
	}
	const update = event => schedulePositionUpdate(element, getCursorPoint(event, element.ownerDocument));
	for (const event of events) element.addEventListener(event, update, true);
	positionEventBindings.set(element, {
		key,
		remove: () => events.forEach(event => element.removeEventListener(event, update, true))
	});
}

function unplace(element) {
	const state = placementStates.get(element);
	if (!state?.anchor || !state.update) return;
	state.document.removeEventListener("scroll", state.update, true);
	state.document.defaultView?.removeEventListener("resize", state.update);
	if (state.frame) state.document.defaultView?.cancelAnimationFrame(state.frame);
	state.anchor = null;
	state.document = null;
	state.update = null;
	state.frame = null;
}

function initTriggers(elements, schedule = true) {
	for (const element of elements) {
		initPositionEvents(element);
		if (schedule && getQueryAttribute(element, "position-query") &&
			getQueryAttribute(element, "position-element")?.trim()) {
			schedulePositionUpdate(element);
		}
	}
}

export function init() {
	refresh(document.documentElement);
}

export function refresh(node, schedule = true) {
	if (node?.nodeType !== 1) return;
	if (node.hasAttribute("position-element") && !getQueryAttribute(node, "position-element")?.trim())
		attachPlacement(node);
	initTriggers([node], schedule);
	initTriggers(node.querySelectorAll(positionConfigSelector), schedule);
	for (const element of node.querySelectorAll('[position-element=""]')) attachPlacement(element);
}

observer.init({
	name: "positionPlacementAddedNodes",
	types: ["addedNodes"],
	selector: positionConfigSelector,
	callback: mutation => refresh(mutation.target)
});

observer.init({
	name: "positionPlacementAttributes",
	types: ["attributes"],
	attributeFilter: ["position-query", "position-events"],
	callback: mutation => refresh(mutation.target, false)
});

init();

export default { init, refresh, initPositionTargets };

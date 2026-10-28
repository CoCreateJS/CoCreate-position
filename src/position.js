import observer from "@cocreate/observer";
import { dispatch } from "./helpers/events.js";

const placementStates = new WeakMap();
const triggerElements = new WeakMap();
const positionEventBindings = new WeakMap();
const positionFrames = new WeakMap();
const pendingPositionEvents = new WeakMap();
const positionConfigSelector = "[position-query], [position-events]";

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
	position.unplace = () => {
		unplace(element);
		element.hidden = true;
	};
}

function getEventSnapshot(event, trigger) {
	const detail = event?.detail && typeof event.detail === "object" ? event.detail : {};
	const originalEvent = detail.originalEvent || event;
	const target = detail.target || originalEvent?.target || event?.target || null;
	const cursor = detail.cursor || (
		Number.isFinite(originalEvent?.clientX) && Number.isFinite(originalEvent?.clientY)
			? { x: originalEvent.clientX, y: originalEvent.clientY }
			: null
	);
	const sourceDocument = detail.document ||
		(target?.nodeType === 9 ? target : target?.ownerDocument) ||
		originalEvent?.view?.document || null;
	const relayTarget = detail.originalEvent ? event.target : null;
	const pointer = {};
	for (const key of ["pointerId", "pointerType", "isPrimary", "button", "buttons", "pressure", "tiltX", "tiltY", "twist", "clientX", "clientY", "pageX", "pageY", "screenX", "screenY"]) {
		if (originalEvent?.[key] !== undefined) pointer[key] = originalEvent[key];
	}
	const keyboard = {};
	for (const key of ["key", "code", "repeat", "altKey", "ctrlKey", "metaKey", "shiftKey"]) {
		if (originalEvent?.[key] !== undefined) keyboard[key] = originalEvent[key];
	}
	const input = {};
	for (const key of ["inputType", "data", "dataTransfer"]) {
		if (originalEvent?.[key] !== undefined) input[key] = originalEvent[key];
	}

	return {
		type: event?.type || originalEvent?.type || "",
		target,
		relatedTarget: detail.relatedTarget || originalEvent?.relatedTarget || null,
		relayTarget,
		frameElement: sourceDocument?.defaultView?.frameElement ||
			(relayTarget?.tagName === "IFRAME" ? relayTarget : null),
		currentTarget: trigger,
		document: sourceDocument,
		timeStamp: originalEvent?.timeStamp ?? event?.timeStamp ?? null,
		cursor,
		pointer,
		keyboard,
		input,
		detail,
		originalEvent
	};
}

function getRectSnapshot(rect) {
	if (!rect) return null;
	return {
		x: rect.left,
		y: rect.top,
		top: rect.top,
		right: rect.right,
		bottom: rect.bottom,
		left: rect.left,
		width: rect.width,
		height: rect.height
	};
}

function updatePositionContext(element, context) {
	attachPlacement(element);
	Object.assign(element.position, {
		element,
		trigger: context.trigger,
		event: context.event,
		query: context.query,
		queryElement: context.queryElement,
		queryElements: context.queryElements,
		box: {
			element,
			type: context.boxType,
			rect: context.rect || null
		},
		active: context.active
	});
}

function place(element, anchor, options = {}) {
	if (!anchor?.getBoundingClientRect) return;
	const anchorDocument = anchor.ownerDocument ||
		anchor.startContainer?.ownerDocument || anchor.commonAncestorContainer?.ownerDocument;
	if (!anchorDocument) return;
	const targetDocument = element.ownerDocument;
	const boxType = options.box || getQueryAttribute(element, "position-box") || "element";
	const rect = getPositionBox(anchor, boxType, targetDocument);
	if (!rect) return false;
	element.hidden = false;

	let state = placementStates.get(element);
	if (!state) placementStates.set(element, state = {});
	state.options = options;
	if (state.anchor !== anchor || state.boxType !== boxType) {
		unplace(element);
		state.anchor = anchor;
		state.boxType = boxType;
		state.documents = getDocumentChain(anchorDocument, targetDocument);
		state.update = () => {
			if (state.frame) return;
			const view = targetDocument.defaultView;
			state.frame = view.requestAnimationFrame(() => {
				state.frame = null;
				const currentAnchor = state.anchor;
				const isConnected = currentAnchor?.isConnected ??
					currentAnchor?.startContainer?.isConnected ??
					currentAnchor?.commonAncestorContainer?.isConnected;
				if (!isConnected || !place(element, currentAnchor, state.options))
					element.hidden = true;
			});
		};
		for (const document of state.documents) {
			document.addEventListener("scroll", state.update, true);
			document.defaultView?.addEventListener("resize", state.update);
		}
	}

	const view = targetDocument.defaultView;
	const isFixed = view.getComputedStyle(element).position === "fixed";
	const offsetParent = element.offsetParent;
	const parentRect = offsetParent?.getBoundingClientRect();
	element.style.right = "auto";
	element.style.bottom = "auto";
	element.style.left = (isFixed || !parentRect
		? rect.left
		: rect.left - parentRect.left - offsetParent.clientLeft + offsetParent.scrollLeft) + "px";
	element.style.top = (isFixed || !parentRect
		? rect.top
		: rect.top - parentRect.top - offsetParent.clientTop + offsetParent.scrollTop) + "px";
	element.style.width = `${rect.width}px`;
	element.style.height = `${rect.height}px`;
	if (element.position) {
		element.position.isSnap = false;
		if (options.context) {
			updatePositionContext(element, {
				...options.context,
				rect: getRectSnapshot(rect),
				active: true
			});
		} else {
			updatePositionContext(element, {
				trigger: null,
				event: null,
				query: { selector: null, elements: [anchor], element: anchor },
				queryElement: anchor,
				queryElements: [anchor],
				boxType,
				rect: getRectSnapshot(rect),
				active: true
			});
		}
	}
	dispatch(element, "element-positioned");
	return true;
}

function mapRectToDocument(rect, sourceDocument, targetDocument) {
	let document = sourceDocument;
	if (!document || !targetDocument) return null;
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

function getDocumentChain(sourceDocument, targetDocument) {
	const documents = [];
	let document = sourceDocument;
	while (document) {
		documents.push(document);
		if (document === targetDocument) return documents;
		const frame = document.defaultView?.frameElement;
		if (!frame) break;
		document = frame.ownerDocument;
	}
	return documents;
}

function getRectInDocument(target, targetDocument) {
	const sourceDocument = target.ownerDocument ||
		target.startContainer?.ownerDocument || target.commonAncestorContainer?.ownerDocument;
	return mapRectToDocument(target.getBoundingClientRect(), sourceDocument, targetDocument);
}

function getElementBoxInDocument(element, targetDocument) {
	const rect = element.getBoundingClientRect();
	const style = element.ownerDocument.defaultView.getComputedStyle(element);
	const margin = name => Number.parseFloat(style[name]) || 0;
	const left = rect.left - margin("marginLeft");
	const top = rect.top - margin("marginTop");
	const right = rect.right + margin("marginRight");
	const bottom = rect.bottom + margin("marginBottom");
	return mapRectToDocument({ left, top, right, bottom, width: right - left, height: bottom - top },
		element.ownerDocument, targetDocument);
}

function getTextBoxInDocument(element, targetDocument) {
	const document = element.ownerDocument;
	const walker = document.createTreeWalker(element, document.defaultView.NodeFilter.SHOW_TEXT);
	const rects = [];
	let textNode;
	while ((textNode = walker.nextNode())) {
		if (!textNode.nodeValue) continue;
		const range = document.createRange();
		range.selectNodeContents(textNode);
		for (const rect of range.getClientRects()) {
			if (rect.width || rect.height) rects.push(rect);
		}
	}
	if (!rects.length) return null;
	const left = Math.min(...rects.map(rect => rect.left));
	const top = Math.min(...rects.map(rect => rect.top));
	const right = Math.max(...rects.map(rect => rect.right));
	const bottom = Math.max(...rects.map(rect => rect.bottom));
	return mapRectToDocument({ left, top, right, bottom, width: right - left, height: bottom - top },
		document, targetDocument);
}

function getPositionBox(anchor, type, targetDocument) {
	if (anchor.nodeType === 1) {
		if (String(type).toLowerCase() === "text") return getTextBoxInDocument(anchor, targetDocument);
		return getElementBoxInDocument(anchor, targetDocument);
	}
	return getRectInDocument(anchor, targetDocument);
}

function deepest(elements) {
	return elements.reduce((current, element) =>
		!current || current.contains(element) ? element : current, null);
}

function placeFromTrigger(trigger) {
	const event = pendingPositionEvents.get(trigger) || null;
	pendingPositionEvents.delete(trigger);
	const anchorQuery = getQueryAttribute(trigger, "position-query");
	const elementQuery = getQueryAttribute(trigger, "position-element");
	const previousElements = triggerElements.get(trigger) || new Set();
	if (!elementQuery) {
		for (const element of previousElements) clearPlacement(element);
		triggerElements.delete(trigger);
		return;
	}
	const selectionOperator = anchorQuery?.match(/\$selection/);
	let anchor;
	let queryElements = [];
	if (selectionOperator) {
		const prefix = anchorQuery.slice(0, selectionOperator.index).trim();
		const sources = prefix ? trigger.queryElements({ selector: prefix }) : [trigger];
		queryElements = sources;
		for (const source of sources) {
			const sourceDocument = source.nodeType === 9
				? source
				: source.contentDocument || source.ownerDocument;
			const selection = sourceDocument?.getSelection?.();
			if (selection && !selection.isCollapsed && selection.rangeCount) {
				anchor = selection.getRangeAt(0).cloneRange();
				break;
			}
		}
	} else {
		queryElements = anchorQuery
			? trigger.queryElements({ selector: anchorQuery })
			: [trigger];
		anchor = anchorQuery?.includes(":hover") ? deepest(queryElements) : queryElements[0];
	}
	const elements = trigger.queryElements({ selector: elementQuery });
	const currentElements = new Set(elements);
	for (const element of previousElements) {
		if (!currentElements.has(element)) clearPlacement(element);
	}
	triggerElements.set(trigger, currentElements);
	if (!elementQuery) return;
	const options = { box: getQueryAttribute(trigger, "position-box") || "element" };
	const context = {
		trigger,
		event,
		query: { selector: anchorQuery, elements: queryElements, element: anchor },
		queryElement: anchor,
		queryElements,
		boxType: options.box,
		rect: null,
		active: Boolean(anchor)
	};
	options.context = context;
	for (const element of elements) {
		updatePositionContext(element, context);
		if (!anchor || !element.position.place(anchor, options)) clearPlacement(element);
	}
}

function clearPlacement(element) {
	if (!element) return;
	element.position?.unplace?.();
	element.hidden = true;
	if (element.position) element.position.active = false;
}

function schedulePositionUpdate(element, event) {
	pendingPositionEvents.set(element, event);
	if (positionFrames.has(element)) return;
	const frame = element.ownerDocument.defaultView.requestAnimationFrame(() => {
		positionFrames.delete(element);
		placeFromTrigger(element);
	});
	positionFrames.set(element, frame);
}

function initPositionEvents(element) {
	const value = getQueryAttribute(element, "position-events")?.trim() || "";
	const existing = positionEventBindings.get(element);
	if (!element.hasAttribute("position-query")) {
		existing?.remove();
		positionEventBindings.delete(element);
		return;
	}
	const key = value;
	if (existing?.key === key) return;
	existing?.remove();
	const events = value.split(",").map(event => event.trim()).filter(Boolean);
	if (!events.length) {
		positionEventBindings.delete(element);
		return;
	}
	const update = event => schedulePositionUpdate(element, getEventSnapshot(event, element));
	for (const event of events) element.addEventListener(event, update, true);
	positionEventBindings.set(element, {
		key,
		remove: () => events.forEach(event => element.removeEventListener(event, update, true))
	});
}

function unplace(element) {
	const state = placementStates.get(element);
	if (!state?.update) return;
	for (const document of state.documents || []) {
		document.removeEventListener("scroll", state.update, true);
		document.defaultView?.removeEventListener("resize", state.update);
	}
	if (state.frame) element.ownerDocument.defaultView?.cancelAnimationFrame(state.frame);
	state.anchor = null;
	state.boxType = null;
	state.documents = null;
	state.update = null;
	state.frame = null;
}

function initTriggers(elements) {
	for (const element of elements) initPositionEvents(element);
}

export function init() {
	refresh(document.documentElement);
}

export function refresh(node) {
	if (node?.nodeType !== 1) return;
	initTriggers([node]);
	initTriggers(node.querySelectorAll(positionConfigSelector));
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
	attributeFilter: ["position-query", "position-element", "position-events", "position-box"],
	callback: mutation => refresh(mutation.target)
});

init();

export default { init, refresh, initPositionTargets };

import observer from "@cocreate/observer";
import { queryElements } from "@cocreate/utils";
import { dispatch } from "./helpers/events.js";

const placementStates = new WeakMap();
const triggers = new WeakSet();
const hoverTriggers = new WeakSet();
const triggerElements = new WeakMap();

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

function place(element, anchor, options = {}) {
	if (!anchor?.getBoundingClientRect) return;
	let state = placementStates.get(element);
	if (!state) placementStates.set(element, state = {});
	state.options = options;
	if (state.anchor !== anchor) {
		unplace(element);
		state.anchor = anchor;
		state.update = () => {
			if (state.frame) return;
			const view = anchor.ownerDocument.defaultView;
			state.frame = view.requestAnimationFrame(() => {
				state.frame = null;
				if (state.anchor?.isConnected) place(element, state.anchor, state.options);
			});
		};
		anchor.ownerDocument.addEventListener("scroll", state.update, true);
		anchor.ownerDocument.defaultView?.addEventListener("resize", state.update);
	}

	const attribute = (name, fallback) => anchor.getAttribute(name) ?? fallback;
	const placement = options.position || options.placement || attribute("position", "bottom-start");
	const offset = Number(options.offset ?? attribute("position-offset", 8));
	const padding = Number(options.padding ?? attribute("position-padding", 8));
	const collision = (options.collision || attribute("position-collision", "flip shift")).split(/[\s,]+/);
	const anchorRect = getRectInDocument(anchor, element.ownerDocument);
	if (!anchorRect) return;
	const elementRect = element.getBoundingClientRect();
	const container = element.parentElement;
	const parentRect = container?.getBoundingClientRect() || { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
	const view = element.ownerDocument.defaultView;
	const isFixed = view.getComputedStyle(element).position === "fixed";
	const boundary = isFixed
		? { left: 0, top: 0, right: view.innerWidth, bottom: view.innerHeight }
		: parentRect;
	let [side, align = "center"] = String(placement).trim().toLowerCase().split(/[\s-]+/);
	align = ({ left: "start", right: "end", top: "start", bottom: "end" })[align] || align;

	const getCoordinates = currentSide => {
		let left;
		let top;
		if (currentSide === "top" || currentSide === "bottom") {
			top = currentSide === "top"
				? anchorRect.top - elementRect.height - offset
				: anchorRect.bottom + offset;
			left = align === "start" ? anchorRect.left
				: align === "end" ? anchorRect.right - elementRect.width
					: anchorRect.left + (anchorRect.width - elementRect.width) / 2;
		} else {
			left = currentSide === "left"
				? anchorRect.left - elementRect.width - offset
				: anchorRect.right + offset;
			top = align === "start" ? anchorRect.top
				: align === "end" ? anchorRect.bottom - elementRect.height
					: anchorRect.top + (anchorRect.height - elementRect.height) / 2;
		}
		return { left, top };
	};

	let coordinates = getCoordinates(side);
	if (collision.includes("flip")) {
		const opposite = { top: "bottom", bottom: "top", left: "right", right: "left" };
		const overflows =
			(side === "top" && coordinates.top < boundary.top + padding) ||
			(side === "bottom" && coordinates.top + elementRect.height > boundary.bottom - padding) ||
			(side === "left" && coordinates.left < boundary.left + padding) ||
			(side === "right" && coordinates.left + elementRect.width > boundary.right - padding);
		if (overflows) {
			side = opposite[side] || side;
			coordinates = getCoordinates(side);
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

function getRectInDocument(element, targetDocument) {
	let rect = element.getBoundingClientRect();
	let document = element.ownerDocument;
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

function deepest(elements) {
	return elements.reduce((current, element) =>
		!current || current.contains(element) ? element : current, null);
}

function placeFromTrigger(trigger) {
	const anchorQuery = trigger.getAttribute("position-query");
	const elementQuery = trigger.getAttribute("position-element");
	const anchors = anchorQuery
		? queryElements({ element: trigger, selector: anchorQuery })
		: [trigger];
	const anchor = anchorQuery?.includes(":hover") ? deepest(anchors) : anchors[0];
	const elements = elementQuery
		? queryElements({ element: trigger, selector: elementQuery })
		: [];
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

function initHoverTrigger(trigger) {
	if (hoverTriggers.has(trigger) || !trigger.getAttribute("position-query")?.includes(":hover")) return;
	hoverTriggers.add(trigger);
	const update = () => {
		if (trigger.positionHoverFrame) return;
		trigger.positionHoverFrame = trigger.ownerDocument.defaultView.requestAnimationFrame(() => {
			trigger.positionHoverFrame = null;
			placeFromTrigger(trigger);
		});
	};
	if (trigger.tagName === "IFRAME") {
		const attachFrame = () => {
			try {
				const doc = trigger.contentDocument;
				if (!doc || trigger.positionHoverDocument === doc) return;
				trigger.positionHoverDocument = doc;
				doc.addEventListener("mouseover", update);
				doc.addEventListener("mousemove", update);
				doc.addEventListener("mouseout", update);
			} catch {
				// Cross-origin iframe contents cannot be inspected.
			}
		};
		attachFrame();
		trigger.addEventListener("load", attachFrame);
		trigger.addEventListener("mouseleave", update);
	} else {
		trigger.addEventListener("mouseover", update);
		trigger.addEventListener("mousemove", update);
		trigger.addEventListener("mouseout", update);
		trigger.addEventListener("mouseleave", update);
	}
}

function unplace(element) {
	const state = placementStates.get(element);
	if (!state?.anchor || !state.update) return;
	state.anchor.ownerDocument.removeEventListener("scroll", state.update, true);
	state.anchor.ownerDocument.defaultView?.removeEventListener("resize", state.update);
	if (state.frame) state.anchor.ownerDocument.defaultView?.cancelAnimationFrame(state.frame);
	state.anchor = null;
	state.update = null;
	state.frame = null;
}

function initTriggers(elements) {
	for (const trigger of elements) {
		if (!trigger.getAttribute("position-element")?.trim()) continue;
		if (!triggers.has(trigger)) {
			triggers.add(trigger);
			trigger.addEventListener("click", () => {
				trigger.ownerDocument.defaultView.requestAnimationFrame(() => placeFromTrigger(trigger));
			});
		}
		initHoverTrigger(trigger);
	}
}

export function init() {
	refresh(document.documentElement);
}

export function refresh(node) {
	if (node?.nodeType !== 1) return;
	if (node.hasAttribute("position-element") && !node.getAttribute("position-element")?.trim())
		attachPlacement(node);
	initTriggers(node.matches("[position-element]") ? [node] : []);
	initTriggers(node.querySelectorAll("[position-element]"));
	for (const element of node.querySelectorAll('[position-element=""]')) attachPlacement(element);
}

observer.init({
	name: "positionPlacementAddedNodes",
	types: ["addedNodes"],
	selector: "[position-query], [position-element]",
	callback: mutation => refresh(mutation.target)
});

observer.init({
	name: "positionPlacementAttributes",
	types: ["attributes"],
	attributeFilter: ["position-query", "position-element", "position", "position-offset", "position-padding", "position-collision"],
	selector: "[position-query], [position-element]",
	callback: mutation => refresh(mutation.target)
});

init();

export default { init, refresh, initPositionTargets };

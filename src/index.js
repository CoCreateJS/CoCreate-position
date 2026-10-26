import observer from "@cocreate/observer";
import "./index.css";

const draggableSelector = "[draggable], [draggable-query], [clonable-query]";
const snappableSelector = "[droppable-query], [snappable-query], [position-reference]";
const placementSelector = "[position-target], [position-query]";

let draggablePromise;
let snappablePromise;
let placementPromise;

function load(getPromise, setPromise, importer) {
	let promise = getPromise();
	if (!promise) {
		promise = importer()
			.then(module => {
				module.init?.();
				return module.default || module;
			})
			.catch(error => {
				setPromise(undefined);
				throw error;
			});
	}
	setPromise(promise);
	return promise;
}

function loadDraggable() {
	return load(() => draggablePromise, value => { draggablePromise = value; },
		() => import(/* webpackChunkName: "position-draggable" */ "./draggable.js"));
}

function loadSnappable() {
	return load(() => snappablePromise, value => { snappablePromise = value; },
		() => import(/* webpackChunkName: "position-snappable" */ "./snappable.js"));
}

function loadPlacement() {
	return load(() => placementPromise, value => { placementPromise = value; },
		() => import(/* webpackChunkName: "position-placement" */ "./position.js"));
}

function reportError(element, error, feature) {
	const EventConstructor = element?.ownerDocument?.defaultView?.CustomEvent || CustomEvent;
	element?.dispatchEvent(new EventConstructor("position-error", {
		bubbles: true,
		detail: { error, feature }
	}));
}

function loadForMutation({ target, attributeName }) {
	if (target?.matches?.(draggableSelector) || attributeName === "draggable")
		loadDraggable().catch(error => reportError(target, error, "draggable"));
	if (target?.matches?.(snappableSelector) || ["draggable-query", "clonable-query", "droppable-query", "snappable-query", "position-reference"].includes(attributeName))
		loadSnappable().catch(error => reportError(target, error, "snappable"));
	if (target?.matches?.(placementSelector) || ["position-target", "position-query"].includes(attributeName))
		loadPlacement().catch(error => reportError(target, error, "placement"));
}

observer.init([
	{
		name: "CoCreatePositionLoaderAddedNodes",
		types: ["addedNodes"],
		selector: [draggableSelector, snappableSelector, placementSelector].join(", "),
		callback: loadForMutation
	},
	{
		name: "CoCreatePositionLoaderAttributes",
		types: ["attributes"],
		attributeFilter: ["draggable", "draggable-query", "clonable-query", "droppable-query", "snappable-query", "position-reference", "position-target", "position-query"],
		selector: [draggableSelector, snappableSelector, placementSelector].join(", "),
		callback: loadForMutation
	}
]);

function start() {
	if (document.querySelector(draggableSelector)) loadDraggable().catch(() => {});
	if (document.querySelector(snappableSelector)) loadSnappable().catch(() => {});
	if (document.querySelector(placementSelector)) loadPlacement().catch(() => {});
}

start();

/** Load and initialize the requested position feature modules. */
export function init() {
	start();
	return Promise.all([draggablePromise, snappablePromise, placementPromise].filter(Boolean));
}

export function initElement(element, options) {
	return loadDraggable().then(module => module.initElement(element, options));
}

export function initElements(elements) {
	return loadDraggable().then(module => module.initElements(elements));
}

export { loadDraggable, loadSnappable, loadPlacement };

export default { init, initElement, initElements, loadDraggable, loadSnappable, loadPlacement };

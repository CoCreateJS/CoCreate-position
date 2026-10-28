import observer from "@cocreate/observer";
import { queryElements } from "@cocreate/utils";
import Position from "./draggable/engine.js";
import { initElement } from "./draggable.js";

const scopeSelector = [
	"[droppable-query][draggable-query]",
	"[droppable-query][clonable-query]",
	"[snappable-query][draggable-query]",
	"[snappable-query][clonable-query]"
].join(", ");
const hoveredDocuments = new WeakSet();

function getEditorDetails(element) {
	const current = element?.editor;
	return typeof current?.getStart === "function" ? current : element?.editorDetails;
}

function getEditorSourceRange(element, editorElement, source) {
	const details = getEditorDetails(element);
	if (typeof details?.getOuterRange === "function") {
		if (details.element !== editorElement) return null;
		const range = details.getOuterRange();
		return range && Number.isInteger(range.start) && Number.isInteger(range.end) &&
			range.start >= 0 && range.end >= range.start && range.end <= source.length ? range : null;
	}
	if (details?.editorElement !== editorElement ||
		![details.start, details.contentStart, details.contentEnd, details.end].every(Number.isInteger) ||
		details.start < 0 || details.start > details.contentStart ||
		details.contentStart > details.contentEnd || details.contentEnd > details.end ||
		details.end > source.length)
		return null;
	return details;
}

async function insertIntoEditor({ instance, target, position, value, hasValue, mode }) {
	const details = getEditorDetails(target);
	const editorElement = details?.element || details?.editorElement;
	if (!editorElement || typeof editorElement.editor?.updateText !== "function" ||
		(typeof editorElement.editor?.getSource !== "function" && typeof editorElement.value !== "string")) return false;

	const source = typeof editorElement.editor.getSource === "function"
		? editorElement.editor.getSource() : editorElement.value;
	if (typeof source !== "string") return false;
	const insertionPoint = details.getInsertionPoint?.(position);
	const outerRange = details.getOuterRange?.();
	const contentRange = details.getContentRange?.();
	const targetBoundary = insertionPoint ? insertionPoint.editor.getStart() + insertionPoint.offset : ({
		beforebegin: outerRange?.start ?? details.start,
		afterbegin: contentRange?.start ?? details.contentStart,
		beforeend: contentRange?.end ?? details.contentEnd,
		afterend: outerRange?.end ?? details.end
	})[position];
	const start = targetBoundary;
	if (!Number.isInteger(start) || start < 0 || start > source.length) return false;

	const sourceDetails = mode === "draggable" ? getEditorDetails(instance.el) : null;
	const sourceEditor = sourceDetails?.element || sourceDetails?.editorElement;
	const sourceText = typeof sourceEditor?.editor?.getSource === "function"
		? sourceEditor.editor.getSource() : typeof sourceEditor?.value === "string" ? sourceEditor.value : null;
	const sourceRange = sourceText === null ? null : getEditorSourceRange(instance.el, sourceEditor, sourceText);
	if (sourceEditor && !sourceRange) return false;
	const movingSource = mode === "draggable" && !hasValue && sourceEditor === editorElement && !!sourceRange;
	const insertedText = movingSource
		? sourceText.slice(sourceRange.start, sourceRange.end)
		: typeof value === "string" ? value : value?.outerHTML;
	if (typeof insertedText !== "string") return false;

	if (sourceEditor === editorElement && sourceRange) {
		if (movingSource && start >= sourceRange.start && start <= sourceRange.end) return true;
		let editStart = start;
		let length = 0;
		let text = insertedText;
		if (mode === "draggable") {
			if (start <= sourceRange.start) {
				length = sourceRange.end - start;
				text += sourceText.slice(start, sourceRange.start);
			} else if (start >= sourceRange.end) {
				editStart = sourceRange.start;
				length = start - sourceRange.start;
				text = sourceText.slice(sourceRange.end, start) + text;
			} else {
				editStart = sourceRange.start;
				length = sourceRange.end - sourceRange.start;
			}
		}
		await editorElement.editor.updateText({ start: editStart, length, value: text });
		return true;
	}

	if (insertionPoint) {
		await insertionPoint.editor.updateText({ start: insertionPoint.offset, length: 0, value: insertedText });
	} else await editorElement.editor.updateText({ start, length: 0, value: insertedText });
	if (mode === "draggable") {
		if (sourceEditor && sourceRange)
			await sourceEditor.editor.updateText({
				start: sourceRange.start,
				length: sourceRange.end - sourceRange.start,
				value: ""
			});
		else instance.el.remove();
	}
	return true;
}

function trackHoveredDocument(doc) {
	if (!doc || hoveredDocuments.has(doc)) return;
	hoveredDocuments.add(doc);
	const update = event => {
		doc.hoveredElement = event.target;
		if (doc.documentElement) doc.documentElement.hoveredElement = event.target;
		const frame = doc.defaultView?.frameElement;
		if (frame) frame.hoveredElement = event.target;
	};
	doc.addEventListener("mouseover", update);
	doc.addEventListener("mousemove", update);
}

function mapFramePoint(frame, x, y) {
	const rect = frame.getBoundingClientRect();
	const scaleX = frame.offsetWidth ? rect.width / frame.offsetWidth : 1;
	const scaleY = frame.offsetHeight ? rect.height / frame.offsetHeight : 1;
	return {
		x: rect.left + (frame.clientLeft + x) * scaleX,
		y: rect.top + (frame.clientTop + y) * scaleY
	};
}

const snappableMethods = {
	_shouldDelegateDrag() {
		const scope = this.el.closest(scopeSelector);
		const draggableQuery = scope?.getAttribute("draggable-query");
		const clonableQuery = scope?.getAttribute("clonable-query");
		return !!((draggableQuery && queryElements({ element: scope, selector: draggableQuery }).includes(this.el)) ||
			(clonableQuery && queryElements({ element: scope, selector: clonableQuery }).includes(this.el)));
	},

	_initSnappableDrag() {
		const dropScope = this.dragScope?.hasAttribute("droppable-query")
			? this.dragScope
			: this.el.closest("[droppable-query]");
		const snapScope = this.dragScope?.hasAttribute("snappable-query")
			? this.dragScope
			: this.el.closest("[snappable-query]");
		this.dropQuerySelector = dropScope?.getAttribute("droppable-query") || null;
		this.snapQuerySelector = snapScope?.getAttribute("snappable-query") || null;
		this.referenceQuerySelector = this.dropQuerySelector || this.snapQuerySelector;
		this.referenceQueryElement = this.dropQuerySelector ? dropScope : snapScope;
		this.referenceQueryTargets = null;
		this.referenceTargetsSelector = null;
		this.reference = null;
		this._setActiveDroppable(null);
		this._removePositionMarker();
	},

	_updateSnappableReference(x, y, doc, hoveredElement) {
		if (!this._usesPositionReference()) return;
		this._prepareReferenceTargets();
		this._initReferenceTracking();
		this._updateReference(x, y, doc, hoveredElement);
	},

	_finishSnappableReference(event, reference) {
		if (event && this._usesPositionReference())
			this._updateReference(
				reference?.x ?? event.clientX,
				reference?.y ?? event.clientY,
				reference?.document ?? this.el.ownerDocument,
				reference?.element
			);
	},

	_completeSnappableDrop(cancelled) {
		if (this.dropQuerySelector) {
			if (!cancelled && this.reference) {
				this._applyDrop().then(inserted => {
					if (!inserted) this._restoreOriginalStyle();
				}).catch(error => {
					console.error("Position drop failed:", error);
					this._restoreOriginalStyle();
				});
			} else {
				this._restoreOriginalStyle();
			}
		} else if (this.snapQuerySelector && !cancelled && this.reference) {
			this._applyDrop().catch(error => console.error("Position snap failed:", error));
		}
	},

	_clearSnappableState() {
		this._removePositionMarker();
		this._setActiveDroppable(null);
	},

	_initReferenceTracking() {
		if (!this._usesPositionReference() || this.referenceTrackingInitialized) return;
		this.referenceTrackingInitialized = true;
		trackHoveredDocument(this.el.ownerDocument);
		const watchFrame = frame => {
			try {
				if (frame.contentDocument?.readyState === "complete")
					this._watchReferenceFrame(frame, frame.contentDocument);
				else frame.addEventListener("load", () => {
					try { this._watchReferenceFrame(frame, frame.contentDocument); } catch {}
				}, { once: true });
			} catch {}
		};
		this.el.ownerDocument.querySelectorAll("iframe").forEach(watchFrame);
		const MutationObserver = this.el.ownerDocument.defaultView.MutationObserver;
		this.referenceObserver = new MutationObserver(mutations => {
			for (const mutation of mutations) for (const node of mutation.addedNodes) {
				if (node.nodeType !== 1) continue;
				if (node.matches("iframe")) watchFrame(node);
				node.querySelectorAll?.("iframe").forEach(watchFrame);
			}
		});
		this.referenceObserver.observe(this.el.ownerDocument.documentElement, {
			childList: true,
			subtree: true
		});
	},

	_usesPositionReference() {
		return this.el.hasAttribute("position-reference") || !!this.referenceQuerySelector;
	},

	_prepareReferenceTargets() {
		const selector = this.referenceQuerySelector;
		if (selector == null) {
			this.referenceQueryTargets = null;
			return;
		}
		if (this.referenceTargetsSelector === selector && this.referenceQueryTargets) return;
		this.referenceTargetsSelector = selector;
		this.referenceQueryTargets = new Set(queryElements({
			element: this.referenceQueryElement || this.dragScope || this.el,
			selector
		}));
	},

	_watchReferenceFrame(frame, frameDocument) {
		if (!frameDocument) return;
		if (frame.positionReferenceDocument !== frameDocument) {
			frame.positionReferenceDocument = frameDocument;
			trackHoveredDocument(frameDocument);
			const update = event => {
				const pointer = event.changedTouches?.[0] || event;
				frame.dispatchEvent(new CustomEvent("position-reference-move", {
					detail: { type: event.type, element: event.target, x: pointer.clientX, y: pointer.clientY, document: frameDocument, originalEvent: event }
				}));
			};
			frameDocument.addEventListener("mouseover", update);
			frameDocument.addEventListener("mousemove", update);
			frameDocument.addEventListener("mouseup", update);
			frameDocument.addEventListener("touchmove", update, { passive: false });
			frameDocument.addEventListener("touchend", update);
			frameDocument.addEventListener("touchcancel", update);
		}
		if (!frame.positionReferenceInstances) frame.positionReferenceInstances = new WeakSet();
		if (frame.positionReferenceInstances.has(this)) return;
		frame.positionReferenceInstances.add(this);
		frame.addEventListener("position-reference-move", event => {
			if (!this.clickedInfo?.isMoving) {
				if (["mouseup", "touchend", "touchcancel"].includes(event.detail.type))
					this._cancelPendingDragStart();
				return;
			}
			if (event.detail.type === "touchmove") event.detail.originalEvent?.preventDefault();
			const point = mapFramePoint(frame, event.detail.x, event.detail.y);
			const reference = {
				x: event.detail.x,
				y: event.detail.y,
				document: event.detail.document,
				element: event.detail.element
			};
			if (event.detail.type === "mouseup" || event.detail.type === "touchend" || event.detail.type === "touchcancel") {
				this._onUp({ clientX: point.x, clientY: point.y }, event.detail.type === "touchcancel", reference);
				return;
			}
			this._onMove({ clientX: point.x, clientY: point.y }, reference);
		});
	},

	_setActiveDroppable(container) {
		if (this.activeDroppable === container) return;
		this.activeDroppable?.removeAttribute("droppable");
		this.activeDroppable = container || null;
		this.activeDroppable?.setAttribute("droppable", "");
	},

	_updateReference(x, y, doc, hoveredElement) {
		let candidate = hoveredElement || doc.elementsFromPoint(x, y).find(element =>
			element !== this.el && !this.el.contains(element));
		if (candidate === this.el || this.el.contains(candidate)) candidate = null;
		const hasContainerQuery = !!this.referenceQuerySelector;
		let element = candidate;
		let container = null;
		let isEmptyContainer = false;
		if (candidate && hasContainerQuery) {
			this._prepareReferenceTargets();
			container = candidate;
			while (container && !this.referenceQueryTargets.has(container)) container = container.parentElement;
			this._setActiveDroppable(container);

			if (!container) {
				element = null;
			} else if ([...container.children].filter(child =>
				!child.hasAttribute("position-marker") && child !== this.el && !this.el.contains(child)
			).length === 0) {
				element = container;
				isEmptyContainer = true;
			} else {
				element = candidate === container ? null : candidate;
				while (element && element.parentElement !== container) element = element.parentElement;
				if (element?.hasAttribute("position-marker")) element = null;
				if (!element) {
					let closestDistance = Infinity;
					for (const child of container.children) {
						if (child.hasAttribute("position-marker") || child === this.el || this.el.contains(child)) continue;
						const rect = child.getBoundingClientRect();
						const dx = Math.max(rect.left - x, 0, x - rect.right);
						const dy = Math.max(rect.top - y, 0, y - rect.bottom);
						const distance = dx * dx + dy * dy;
						if (distance < closestDistance) {
							closestDistance = distance;
							element = child;
						}
					}
				}
			}
		} else {
			this._setActiveDroppable(null);
		}

		if (!element) {
			this._removePositionMarker();
			if (this.reference) {
				this.reference = null;
				this.createEvent("element-position-reference");
			}
			return;
		}

		const rect = element.getBoundingClientRect();
		const vertical = rect.height >= rect.width;
		const offset = vertical ? y - rect.top : x - rect.left;
		const size = vertical ? rect.height : rect.width;
		let position;
		if (isEmptyContainer) position = "afterbegin";
		else if (hasContainerQuery) position = offset < size / 2 ? "beforebegin" : "afterend";
		else {
			const edge = Math.min(size * 0.2, 24);
			if (offset < edge) position = "beforebegin";
			else if (offset > size - edge) position = "afterend";
			else position = offset < size / 2 ? "afterbegin" : "beforeend";
		}

		this.reference = { element, container: hasContainerQuery ? container : null, position, x, y, document: doc };
		this._updatePositionMarker(this.reference);
		this.createEvent("element-position-reference");
	},

	_updatePositionMarker(reference) {
		const doc = reference.document || this.el.ownerDocument;
		if (!this.positionMarker || this.positionMarker.ownerDocument !== doc) {
			this._removePositionMarker();
			const marker = this.el.cloneNode(true);
			const activationAttributes = ["draggable", "draggable-query", "clonable-query", "droppable-query", "snappable-query", "draggable-value", "clonable-value", "position-query", "position-element", "position-reference", "snapped", "position-marker"];
			for (const element of [marker, ...marker.querySelectorAll("*")]) {
				element.removeAttribute("id");
				element.removeAttribute("style");
				for (const attribute of activationAttributes) element.removeAttribute(attribute);
				element.classList.remove("position-moving", "position-moving-preview", "position-cloning", "selectedPosition");
			}
			marker.setAttribute("position-marker", "");
			marker.setAttribute("aria-hidden", "true");
			marker.setAttribute("inert", "");
			this.positionMarker = marker;
		}

		const marker = this.positionMarker;
		const alreadyPlaced = reference.position === "beforebegin"
			? marker.nextElementSibling === reference.element
			: reference.position === "afterend"
				? marker.previousElementSibling === reference.element
				: reference.position === "afterbegin"
					? marker.parentElement === reference.element && marker === reference.element.firstElementChild
					: marker.parentElement === reference.element && marker === reference.element.lastElementChild;
		if (!alreadyPlaced) reference.element.insertAdjacentElement(reference.position, marker);
	},

	_removePositionMarker() {
		this.positionMarker?.remove();
		this.positionMarker = null;
	},

	async _applyDrop() {
		const { element, position } = this.reference || {};
		if (!element || !position || !this.referenceQuerySelector) return false;
		if (element === this.el || this.el.contains(element)) return false;
		const mode = this.dragType === "clonable" ? "clonable" : "draggable";
		const valueAttribute = `${mode}-value`;
		const hasValue = this.el.hasAttribute(valueAttribute);
		const value = hasValue ? this.el.getAttribute(valueAttribute)
			: mode === "clonable" ? this.el.cloneNode(true) : this.el;
		if (typeof value !== "string" && value?.nodeType !== 1) return false;
		const insertValue = mode === "clonable" && value === this.el ? this.el.cloneNode(true) : value;
		this._restoreOriginalStyle();
		if (getEditorDetails(element)) {
			const inserted = await insertIntoEditor({
				instance: this,
				target: element,
				position,
				value,
				hasValue,
				mode
			});
			if (!inserted) return false;
			this.createEvent("element-position-inserted", {
				type: mode,
				value: insertValue,
				inserted: true,
				reference: this.reference,
				editorElement: getEditorDetails(element).element || getEditorDetails(element).editorElement
			});
			return true;
		}
		let inserted;
		try {
			if (typeof value === "string") {
				element.insertAdjacentHTML(position, value);
				inserted = true;
			} else inserted = element.insertAdjacentElement(position, insertValue);
		} catch (error) {
			console.error("Position drop failed:", error);
			return false;
		}
		if (!inserted) return false;
		if (this.snapQuerySelector && mode === "draggable" && insertValue === this.el) {
			this.el.removeAttribute("style");
			this.el.setAttribute("snapped", "");
		}
		if (mode === "draggable" && hasValue && value !== this.el) this.el.remove();
		this.createEvent("element-position-inserted", { type: mode, value: insertValue, inserted, reference: this.reference });
		return true;
	},

	_restoreOriginalStyle() {
		if (this.originalStyle?.present) this.el.setAttribute("style", this.originalStyle.value);
		else this.el.removeAttribute("style");
	}
};

Object.assign(Position.prototype, snappableMethods);

function initScopes(scopes) {
	for (const scope of scopes) {
		const matchesScope = scope.matches(scopeSelector);
		if (scope.positionDragDelegation && matchesScope) continue;
		if (scope.positionDragDelegation) {
			scope.removeEventListener("mousedown", scope.positionDragDelegation);
			scope.removeEventListener("touchstart", scope.positionDragDelegation);
			scope.positionDragDelegation = null;
		}
		if (!matchesScope) continue;

		const startDrag = event => {
			if (event.__positionHandled) return;
			const draggableQuery = scope.getAttribute("draggable-query");
			const clonableQuery = scope.getAttribute("clonable-query");
			const draggableMatches = new Set(draggableQuery ? queryElements({ element: scope, selector: draggableQuery }) : []);
			const clonableMatches = new Set(clonableQuery ? queryElements({ element: scope, selector: clonableQuery }) : []);
			let element = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
			while (element && element !== scope && !draggableMatches.has(element) && !clonableMatches.has(element))
				element = element.parentElement;
			if (!element || element === scope || (!draggableMatches.has(element) && !clonableMatches.has(element))) return;
			const dragType = clonableMatches.has(element) ? "clonable" : "draggable";
			if (!element.position?._positionController)
				initElement(element, { draggable: true, dragScope: scope, dragType, delegated: true });
			Object.assign(element.position.options, {
				draggable: true,
				dragScope: scope,
				delegated: true,
				dragType
			});
			event.__positionDelegated = true;
			event.__positionHandled = true;
			element.position._handlePointerDown(event);
		};
		scope.positionDragDelegation = startDrag;
		scope.addEventListener("mousedown", startDrag);
		scope.addEventListener("touchstart", startDrag, { passive: false });
	}
}

function refresh(node) {
	if (node.nodeType !== 1) return;
	if (node.matches(scopeSelector)) initScopes([node]);
	initScopes(node.querySelectorAll(scopeSelector));
}

export function init() {
	initScopes(document.querySelectorAll(scopeSelector));
}

observer.init({
	name: "positionSnappableAddedNodes",
	types: ["addedNodes"],
	selector: scopeSelector,
	callback: mutation => refresh(mutation.target)
});

observer.init({
	name: "positionSnappableAttributes",
	types: ["attributes"],
	attributeFilter: ["draggable-query", "clonable-query", "droppable-query", "snappable-query"],
	selector: "[draggable-query], [clonable-query], [droppable-query], [snappable-query]",
	callback: mutation => initScopes([mutation.target])
});

init();

export default { init };

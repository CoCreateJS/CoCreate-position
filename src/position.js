import { queryElements } from "@cocreate/utils";

function position(el, container, options) {
    if (!(el && el.nodeType && el.nodeType === 1)) {
        return;
    }

    this.options = Object.assign({ draggable: true }, options);
    /** define constant **/
    this.MARGIN = 5;
    this.FULLSCREEN_MARGIN = -60;
    this.NO_SNAP = -100;
    this.SNAP_MARGIN = -10;
    this.RIGHT_SCROL = 5;
    this.dragHandle = el.querySelector('[drag-handle]')
    this.container = container;
    if (!this.container.positionIndex)
        this.container.positionIndex = 10

    this.el = el;
    this.boundStatus = {};

    this.selectedElement;
    // this.selectedClass = "selectedPosition";
    /**
     * x: mouse x in element
     * y: mouse y in element
     * cx: x in document
     * cy: y in document
     * */
    this.point = {};
    this.rect = {};
    this.clickedInfo = null;
    this.preSnapped = null;
    this.isSnap = false;
    this.reference = null;

    if (this.options.draggable) {
        this._createSnapGhost(this.container.getAttribute("data-ghost-class"));
        this._initEvent();
        this._selectElement();
    }
}

const INTERACTIVE_SELECTOR = [
    "a",
    "button",
    "input",
    "select",
    "textarea",
    "label",
    "summary",
    "[contenteditable]:not([contenteditable='false'])",
    "[moveable-ignore]"
].join(",");

const hoveredDocuments = new WeakSet();

function trackHoveredDocument(doc) {
    if (!doc || hoveredDocuments.has(doc)) return;
    hoveredDocuments.add(doc);

    const update = (e) => {
        doc.hoveredElement = e.target;
        if (doc.documentElement) doc.documentElement.hoveredElement = e.target;
        const frame = doc.defaultView?.frameElement;
        if (frame) frame.hoveredElement = e.target;
    };

    doc.addEventListener("mouseover", update);
    doc.addEventListener("mousemove", update);
}

position.prototype = {
    constructor: position,

    _initEvent: function () {
        if (!this.eventsInitialized) {
            this.eventsInitialized = true;
            const self = this;
            this.iframe = this.el.querySelector('iframe')
            if (this.iframe) {
                this.iframe.addEventListener('load', function () {
                    const iframeContent = self.iframe.contentDocument;
                    iframeContent.addEventListener('mousedown', function (e) {
                        self._selectElement(e.detail.element)
                    })
                    if (self._usesPositionReference()) {
                        self._watchReferenceFrame(self.iframe, iframeContent);
                    }
                });
            }

            this._initReferenceTracking();
            this.__setRectInfo();

            this._documentMouseMove = function (e) {
                if (!self.clickedInfo?.isMoving) return;
                e.preventDefault();
                self._onMove(e);
            };
            this._documentMouseUp = function (e) {
                if (!self.clickedInfo?.isMoving) return;
                self._onUp(e);
                e.preventDefault();
            };
            this._documentTouchMove = function (e) {
                if (!self.clickedInfo?.isMoving || !e.touches.length) return;
                e.preventDefault();
                self._onMove(e.touches[0]);
            };
            this._documentTouchEnd = function (e) {
                if (!self.clickedInfo?.isMoving) return;
                self._onUp(e.changedTouches?.[0], e.type === "touchcancel");
            };
            this._documentBlur = function () {
                self._onUp(null, true);
            };
        }

        if (!this.options.delegated && !this.startEventsInitialized) {
            this.startEventsInitialized = true;
            const dragTargetEl = this.dragHandle || this.el;
            dragTargetEl.addEventListener('touchstart', (e) => this._handlePointerDown(e));
            dragTargetEl.addEventListener('mousedown', (e) => this._handlePointerDown(e));
        }

    },

    _handlePointerDown: function (event) {
        if (!event.__positionDelegated) {
            const scope = this.el.closest("[droppable-query][draggable-query], [droppable-query][clonable-query], [snappable-query][draggable-query], [snappable-query][clonable-query]");
            const draggableQuery = scope?.getAttribute("draggable-query");
            const clonableQuery = scope?.getAttribute("clonable-query");
            if ((draggableQuery && queryElements({ element: scope, selector: draggableQuery }).includes(this.el)) ||
                (clonableQuery && queryElements({ element: scope, selector: clonableQuery }).includes(this.el)))
                return;
            this.options.dragType = "draggable";
            event.__positionHandled = true;
        }
        this._onDown(event.touches?.[0] || event, !!event.__positionDelegated);
        // Prevent native text selection only after this gesture qualifies as a drag.
        if (this.clickedInfo?.isMoving) {
            event.__positionHandled = true;
            event.preventDefault();
        }
        this._selectElement();
        if (this.clickedInfo?.isMoving) this._bindDocumentDrag();
    },

    _bindDocumentDrag: function () {
        this._unbindDocumentDrag();
        document.addEventListener('mousemove', this._documentMouseMove);
        document.addEventListener('mouseup', this._documentMouseUp, true);
        document.addEventListener('touchmove', this._documentTouchMove, { passive: false });
        document.addEventListener('touchend', this._documentTouchEnd, true);
        document.addEventListener('touchcancel', this._documentTouchEnd, true);
        window.addEventListener('blur', this._documentBlur);
    },

    _unbindDocumentDrag: function () {
        document.removeEventListener('mousemove', this._documentMouseMove);
        document.removeEventListener('mouseup', this._documentMouseUp, true);
        document.removeEventListener('touchmove', this._documentTouchMove);
        document.removeEventListener('touchend', this._documentTouchEnd, true);
        document.removeEventListener('touchcancel', this._documentTouchEnd, true);
        window.removeEventListener('blur', this._documentBlur);
    },

    place: function (anchor = this.el, options = {}) {
        if (!anchor?.getBoundingClientRect) return;

        this.positionOptions = options;
        if (this.positionAnchor !== anchor) {
            if (this.positionAnchor && this.positionUpdate) {
                this.positionAnchor.ownerDocument.removeEventListener("scroll", this.positionUpdate, true);
                this.positionAnchor.ownerDocument.defaultView?.removeEventListener("resize", this.positionUpdate);
            }
            this.positionAnchor = anchor;
            this.positionUpdate = () => {
                if (this.positionUpdateFrame) return;
                const view = anchor.ownerDocument.defaultView;
                this.positionUpdateFrame = view.requestAnimationFrame(() => {
                    this.positionUpdateFrame = null;
                    if (this.positionAnchor?.isConnected)
                        this.place(this.positionAnchor, this.positionOptions);
                });
            };
            anchor.ownerDocument.addEventListener("scroll", this.positionUpdate, true);
            anchor.ownerDocument.defaultView?.addEventListener("resize", this.positionUpdate);
        }

        const placement = options.position || options.placement ||
            anchor.getAttribute("position") ||
            "bottom-start";
        const offset = Number(options.offset ??
            anchor.getAttribute("position-offset") ?? 8);
        const padding = Number(options.padding ??
            anchor.getAttribute("position-padding") ?? 8);
        const collision = (options.collision ||
            anchor.getAttribute("position-collision") ||
            "flip shift").split(/[\s,]+/);

        const anchorRect = anchor.getBoundingClientRect();
        const elementRect = this.el.getBoundingClientRect();
        const parentRect = this.container.getBoundingClientRect();
        const isFixed = getComputedStyle(this.el).position === "fixed";
        const boundary = isFixed
            ? { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
            : parentRect;
        let [side, align = "center"] = String(placement).trim().toLowerCase().split(/[\s-]+/);
        align = ({ left: "start", right: "end", top: "start", bottom: "end" })[align] || align;

        const getCoordinates = (currentSide) => {
            let left;
            let top;
            if (currentSide === "top" || currentSide === "bottom") {
                top = currentSide === "top"
                    ? anchorRect.top - elementRect.height - offset
                    : anchorRect.bottom + offset;
                left = align === "start"
                    ? anchorRect.left
                    : align === "end"
                        ? anchorRect.right - elementRect.width
                        : anchorRect.left + (anchorRect.width - elementRect.width) / 2;
            } else {
                left = currentSide === "left"
                    ? anchorRect.left - elementRect.width - offset
                    : anchorRect.right + offset;
                top = align === "start"
                    ? anchorRect.top
                    : align === "end"
                        ? anchorRect.bottom - elementRect.height
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
            coordinates.left = Math.min(
                Math.max(coordinates.left, boundary.left + padding),
                Math.max(boundary.left + padding, boundary.right - elementRect.width - padding)
            );
            coordinates.top = Math.min(
                Math.max(coordinates.top, boundary.top + padding),
                Math.max(boundary.top + padding, boundary.bottom - elementRect.height - padding)
            );
        }

        this.el.style.right = "auto";
        this.el.style.bottom = "auto";
        this.el.style.left = (isFixed
            ? coordinates.left
            : coordinates.left - parentRect.left + this.container.scrollLeft) + "px";
        this.el.style.top = (isFixed
            ? coordinates.top
            : coordinates.top - parentRect.top + this.container.scrollTop) + "px";
        this.isSnap = false;
        this.__setRectInfo();
        this.createEvent("element-positioned");
    },

    unplace: function () {
        const anchor = this.positionAnchor;
        if (anchor && this.positionUpdate) {
            anchor.ownerDocument.removeEventListener("scroll", this.positionUpdate, true);
            anchor.ownerDocument.defaultView?.removeEventListener("resize", this.positionUpdate);
        }
        if (this.positionUpdateFrame)
            anchor?.ownerDocument.defaultView?.cancelAnimationFrame(this.positionUpdateFrame);
        this.positionAnchor = null;
        this.positionUpdate = null;
        this.positionUpdateFrame = null;
    },

    _onDown: function (e, delegated = false) {
        this.dragPreviewStarted = false;
        if (!this.options.draggable) {
            this.clickedInfo = null;
            return;
        }
        this.dragScope = delegated && this.options.dragScope?.contains(this.el)
            ? this.options.dragScope
            : null;
        this.referenceQueryTargets = null;
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
        this.dragType = this.options.dragType || "draggable";
        this.reference = null;
        this._setActiveDroppable(null);
        this._removePositionMarker();
        this.originalStyle = {
            present: this.el.hasAttribute("style"),
            value: this.el.getAttribute("style")
        };
        // A title-bar style drag handle may contain controls. Those controls
        // must retain their native click, focus, and file-picker behavior.
        const interactive = e.target?.closest?.(INTERACTIVE_SELECTOR);
        if (this.dragHandle && interactive && this.dragHandle.contains(interactive)) {
            this.clickedInfo = null;
            return;
        }

        this.__getBoundStatus(e);

        this.clickedInfo = {
            x: this.point.x,
            y: this.point.y,
            cx: this.point.cx,
            cy: this.point.cy,
            w: this.rect.width,
            h: this.rect.height,
            isMoving: true,
            boundStatus: this.boundStatus,
            isChangeStart: true
        }
        this.dragOriginRect = this.el.getBoundingClientRect();
        const computed = getComputedStyle(this.el);
        this.dragOriginPosition = computed.position;
        this.dragOriginLeft = parseFloat(computed.left) || 0;
        this.dragOriginTop = parseFloat(computed.top) || 0;
        this.dragOriginalVisibility = [
            this.el.style.getPropertyValue("visibility"),
            this.el.style.getPropertyPriority("visibility")
        ];
        this.dragOriginalOpacity = computed.opacity;
        const style = this.el.style;
        this.dragSizeVariables = {
            width: [style.getPropertyValue("--position-moving-width"), style.getPropertyPriority("--position-moving-width")],
            height: [style.getPropertyValue("--position-moving-height"), style.getPropertyPriority("--position-moving-height")]
        };
    },

    _onMove: function (e) {
        this._startMoving(e);
        if (this._usesPositionReference()) {
            this._prepareReferenceTargets();
            this._initReferenceTracking();
            this._updateReference(e.clientX, e.clientY, this.el.ownerDocument);
        }
        this.__getBoundStatus(e)
        this.__animate();
    },

    _startMoving: function () {
        if (!this.clickedInfo?.isMoving || this.dragPreviewStarted) return;
        this.dragPreviewStarted = true;
        this.el.classList.add("position-moving");
        if (this.dragType === "clonable")
            this.el.classList.add("position-cloning");
        this.movingPosition = this.dragOriginPosition;
        const rect = this.dragOriginRect;
        this.el.style.setProperty("--position-moving-width", rect.width + "px");
        this.el.style.setProperty("--position-moving-height", rect.height + "px");
        this._createDragGhost();
        if (this.dragType !== "clonable") {
            this.el.style.setProperty("visibility", "hidden");
        }
        if (this.dragType === "clonable") return;
        if (this.movingPosition === "fixed") {
            this.el.style.left = rect.left + "px";
            this.el.style.top = rect.top + "px";
            this.el.style.right = "auto";
            this.el.style.bottom = "auto";
        } else if (this.movingPosition === "absolute") {
            const offsetParent = this.el.offsetParent || this.el.parentElement;
            const parentRect = offsetParent.getBoundingClientRect();
            this.el.style.left = rect.left - parentRect.left - offsetParent.clientLeft + offsetParent.scrollLeft + "px";
            this.el.style.top = rect.top - parentRect.top - offsetParent.clientTop + offsetParent.scrollTop + "px";
            this.el.style.right = "auto";
            this.el.style.bottom = "auto";
        }
    },

    _createDragGhost: function () {
        const doc = this.el.ownerDocument;
        const ghost = this.el.cloneNode(true);
        const computed = getComputedStyle(this.el);
        for (let i = 0; i < computed.length; i++) {
            const property = computed[i];
            ghost.style.setProperty(property, computed.getPropertyValue(property), computed.getPropertyPriority(property));
        }
        ghost.classList.add("position-moving");
        ghost.classList.add("position-moving-preview");
        ghost.classList.remove("position-cloning");
        if (this.dragType === "clonable")
            ghost.style.opacity = this.dragOriginalOpacity;
        ghost.setAttribute("aria-hidden", "true");
        const activationAttributes = ["draggable", "position-target", "draggable-query", "clonable-query", "droppable-query", "snappable-query", "draggable-value", "clonable-value", "position-reference"];
        const previewElements = [ghost, ...ghost.querySelectorAll("*")];
        for (const element of previewElements) {
            element.removeAttribute("id");
            for (const attribute of activationAttributes) element.removeAttribute(attribute);
        }
        ghost.style.position = "fixed";
        ghost.style.left = this.dragOriginRect.left + "px";
        ghost.style.top = this.dragOriginRect.top + "px";
        ghost.style.width = this.dragOriginRect.width + "px";
        ghost.style.height = this.dragOriginRect.height + "px";
        ghost.style.margin = "0";
        ghost.style.pointerEvents = "none";
        ghost.style.zIndex = "2147483647";
        (doc.body || doc.documentElement).appendChild(ghost);
        this.dragGhostEl = ghost;
    },

    _moveDragPreview: function () {
        if (!this.clickedInfo) return;
        const left = this.point.clientX - this.clickedInfo.x;
        const top = this.point.clientY - this.clickedInfo.y;
        if (this.dragGhostEl) {
            this.dragGhostEl.style.left = left + "px";
            this.dragGhostEl.style.top = top + "px";
        }
        if (this.dragType === "clonable") {
            return;
        } else if (this.movingPosition === "fixed") {
            this.el.style.left = left + "px";
            this.el.style.top = top + "px";
        } else if (this.movingPosition === "absolute") {
            const offsetParent = this.el.offsetParent || this.el.parentElement;
            const parentRect = offsetParent.getBoundingClientRect();
            this.el.style.left = this.point.clientX - parentRect.left - offsetParent.clientLeft + offsetParent.scrollLeft - this.clickedInfo.x + "px";
            this.el.style.top = this.point.clientY - parentRect.top - offsetParent.clientTop + offsetParent.scrollTop - this.clickedInfo.y + "px";
        } else {
            this.el.style.left = this.dragOriginLeft + this.point.clientX - this.dragOriginRect.left + "px";
            this.el.style.top = this.dragOriginTop + this.point.clientY - this.dragOriginRect.top + "px";
        }
    },

    _finishMoving: function () {
        this.el.classList.remove("position-moving");
        this.el.classList.remove("position-cloning");
        this.dragGhostEl?.remove();
        this.dragGhostEl = null;
        this.dragPreviewStarted = false;
        const [visibility, priority] = this.dragOriginalVisibility || [];
        if (visibility) this.el.style.setProperty("visibility", visibility, priority);
        else this.el.style.removeProperty("visibility");
        if (this.dragSizeVariables) {
            for (const [name, [value, priority]] of Object.entries({
                "--position-moving-width": this.dragSizeVariables.width,
                "--position-moving-height": this.dragSizeVariables.height
            })) {
                if (value) this.el.style.setProperty(name, value, priority);
                else this.el.style.removeProperty(name);
            }
        }
    },

    _initReferenceTracking: function () {
        if (!this._usesPositionReference() || this.referenceTrackingInitialized) return;
        this.referenceTrackingInitialized = true;
        trackHoveredDocument(this.el.ownerDocument);
        const watchFrame = (frame) => {
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
        this.referenceObserver = new MutationObserver((mutations) => {
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

    _usesPositionReference: function () {
        return this.el.hasAttribute("position-reference") ||
            !!this.referenceQuerySelector;
    },

    _prepareReferenceTargets: function () {
        const selector = this.referenceQuerySelector;
        if (selector === null) {
            this.referenceQuerySelector = selector;
            this.referenceQueryTargets = null;
            return;
        }
        if (this.referenceQuerySelector === selector && this.referenceQueryTargets) return;

        this.referenceQuerySelector = selector;
        this.referenceQueryTargets = new Set(queryElements({
            element: this.referenceQueryElement || this.dragScope || this.el,
            selector
        }));
    },

    _watchReferenceFrame: function (frame, frameDocument) {
        if (!frameDocument) return;
        if (frame.positionReferenceDocument !== frameDocument) {
            frame.positionReferenceDocument = frameDocument;
            trackHoveredDocument(frameDocument);
            const update = (e) => {
                frame.dispatchEvent(new CustomEvent("position-reference-move", {
                    detail: { element: e.target, x: e.clientX, y: e.clientY, document: frameDocument }
                }));
            };
            frameDocument.addEventListener("mouseover", update);
            frameDocument.addEventListener("mousemove", update);
        }
        if (!frame.positionReferenceInstances) frame.positionReferenceInstances = new WeakSet();
        if (frame.positionReferenceInstances.has(this)) return;
        frame.positionReferenceInstances.add(this);
        frame.addEventListener("position-reference-move", (e) => {
            if (!this.clickedInfo?.isMoving) return;
            this._prepareReferenceTargets();
            this._updateReference(e.detail.x, e.detail.y, e.detail.document, e.detail.element);
        });
    },

    _setActiveDroppable: function (container) {
        if (this.activeDroppable === container) return;
        this.activeDroppable?.removeAttribute("droppable");
        this.activeDroppable = container || null;
        this.activeDroppable?.setAttribute("droppable", "");
    },

    _updateReference: function (x, y, doc, hoveredElement) {
        let candidate = hoveredElement || doc.elementsFromPoint(x, y).find((candidate) =>
            candidate !== this.el && !this.el.contains(candidate)
        );
        if (candidate === this.el || this.el.contains(candidate)) candidate = null;
        const hasContainerQuery = !!this.referenceQuerySelector;
        let element = candidate;
        let container = null;
        let isEmptyContainer = false;
        if (candidate && hasContainerQuery) {
            this._prepareReferenceTargets();
            container = element;
            while (container && !this.referenceQueryTargets.has(container))
                container = container.parentElement;

            this._setActiveDroppable(container);

            if (!container) {
                element = null;
            } else if ([...container.children].filter((child) =>
                !child.hasAttribute("position-marker")
            ).length === 0) {
                element = container;
                isEmptyContainer = true;
            } else {
                element = candidate === container ? null : candidate;
                while (element && element.parentElement !== container)
                    element = element.parentElement;
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

        const reference = {
            element,
            container: hasContainerQuery ? container : null,
            position,
            x,
            y,
            document: doc
        };
        this.reference = reference;
        this._updatePositionMarker(reference);
        this.createEvent("element-position-reference");
    },

    _updatePositionMarker: function (reference) {
        const doc = reference.document || this.el.ownerDocument;
        if (!this.positionMarker || this.positionMarker.ownerDocument !== doc) {
            this._removePositionMarker();
            const marker = this.el.cloneNode(true);
            const activationAttributes = [
                "draggable",
                "draggable-query",
                "clonable-query",
                "droppable-query",
                "snappable-query",
                "draggable-value",
                "clonable-value",
                "position-query",
                "position-target",
                "position-reference",
                "snapped",
                "position-marker"
            ];
            for (const element of [marker, ...marker.querySelectorAll("*")]) {
                element.removeAttribute("id");
                element.removeAttribute("style");
                element.removeAttribute("position-marker");
                for (const attribute of activationAttributes)
                    element.removeAttribute(attribute);
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
        if (!alreadyPlaced)
            reference.element.insertAdjacentElement(reference.position, marker);
    },

    _removePositionMarker: function () {
        this.positionMarker?.remove();
        this.positionMarker = null;
    },

    _onUp: function (e, cancelled = false) {
        this._unbindDocumentDrag();
        if (!this.clickedInfo) {
            this._finishMoving();
            this._setActiveDroppable(null);
            this._removePositionMarker();
            return;
        }
        if (e) {
            this.__getBoundStatus(e);
            if (this._usesPositionReference())
                this._updateReference(e.clientX, e.clientY, this.el.ownerDocument);
        }
        if (this.clickedInfo.isMoving && !this.dropQuerySelector &&
            !(this.snapQuerySelector && this.reference) && !this.isParked) {
            const snap_info = this._getViewportSnapArea();

            if (snap_info && !this.isSnap) {
                this._applyViewportSnap(snap_info);
                this.preSnapped = { x: this.rect.x, y: this.rect.y, width: this.rect.width, height: this.rect.height };
                this.isSnap = true;
            }

            let ghost_info = {
                x: this.point.clientX - this.clickedInfo.x,
                y: this.point.clientY - this.clickedInfo.y,
                w: this.dragOriginRect.width,
                h: this.dragOriginRect.height
            }

            this._snapGhostProcess(ghost_info)
        }

        if (this.clickedInfo.isMoving) {
            this._finishMoving();
            if (this.dropQuerySelector) {
                if (!cancelled && this.reference) {
                    const inserted = this._applyDrop();
                    if (!inserted) this._restoreOriginalStyle();
                } else {
                    this._restoreOriginalStyle();
                }
            } else if (this.snapQuerySelector && !cancelled && this.reference) {
                this._applyDrop();
            }
        }

        this._removePositionMarker();

        if (this.clickedInfo.isMoving) {
            this.createEvent('element-moveend');
        }

        this._setActiveDroppable(null);
        this.clickedInfo = null;
    },

    _applyDrop: function () {
        const { element, position } = this.reference || {};
        if (!element || !position || !this.referenceQuerySelector) return false;
        if (element === this.el || this.el.contains(element)) return false;

        const mode = this.dragType === "clonable" ? "clonable" : "draggable";
        const valueAttribute = `${mode}-value`;
        const hasValue = this.el.hasAttribute(valueAttribute);
        const value = hasValue
            ? this.el.getAttribute(valueAttribute)
            : mode === "clonable"
                ? this.el.cloneNode(true)
                : this.el;
        if (typeof value !== "string" && value?.nodeType !== 1) return false;
        const insertValue = mode === "clonable" && value === this.el
            ? this.el.cloneNode(true)
            : value;

        this._restoreOriginalStyle();
        let inserted;
        try {
            if (typeof value === "string") {
                element.insertAdjacentHTML(position, value);
                inserted = true;
            } else {
                inserted = element.insertAdjacentElement(position, insertValue);
            }
        } catch (error) {
            console.error("Position drop failed:", error);
            return false;
        }

        if (!inserted) return false;
        if (this.snapQuerySelector && mode === "draggable" && insertValue === this.el) {
            this.el.removeAttribute("style");
            this.el.setAttribute("snapped", "");
        }
        if (mode === "draggable" && hasValue && value !== this.el)
            this.el.remove();

        this.createEvent("element-position-inserted", {
            type: mode,
            value: insertValue,
            inserted,
            reference: this.reference
        });
        return true;
    },

    _restoreOriginalStyle: function () {
        if (this.originalStyle?.present)
            this.el.setAttribute("style", this.originalStyle.value);
        else
            this.el.removeAttribute("style");
    },

    __setBound: function (el, x, y, w, h) {
        el.style.left = x;
        el.style.top = y;
        el.style.width = w;
        el.style.height = h;
    },

    __setRectInfo: function () {
        let bound = this.el.getBoundingClientRect();
        let parentRect = this.el.parentNode.getBoundingClientRect();
        this.rect = {};
        this.rect.x = bound.x - parentRect.x;
        this.rect.y = bound.y - parentRect.y;
        this.rect.width = bound.width;
        this.rect.height = bound.height;
        this.rect.top = bound.top - parentRect.top;
        this.rect.bottom = bound.bottom - parentRect.top;
        this.rect.left = bound.left - parentRect.left;
        this.rect.right = bound.right - parentRect.left;
    },

    __getBoundStatus: function (e) {
        let bound = this.el.getBoundingClientRect();
        let parentRect = this.el.parentNode.getBoundingClientRect();
        let x = e.clientX - bound.left;// - parentRect.left;
        let y = e.clientY - bound.top;// - parentRect.top;

        this.__setRectInfo();

        this.point.x = x;
        this.point.y = y;
        this.point.clientX = e.clientX;
        this.point.clientY = e.clientY;
        this.point.cx = e.clientX - parentRect.left;
        this.point.cy = e.clientY - parentRect.top;

        this.boundStatus = {
            isTop: y < this.MARGIN && y > -this.MARGIN,
            isLeft: x < this.MARGIN && x > -this.MARGIN,
            isRight: x >= bound.width - this.RIGHT_SCROL && x <= bound.width + this.MARGIN + (this.MARGIN - this.RIGHT_SCROL),
            isBottom: y >= bound.height - this.MARGIN && y <= bound.height + this.MARGIN
        }

        return this.boundStatus;
    },

    __between: function (x, min, max) {
        return x >= min && x <= max;
    },

    _getViewportSnapArea: function () {
        if (!this.clickedInfo || !this.dragOriginRect) return null;
        const doc = this.el.ownerDocument;
        const view = doc.defaultView;
        const width = doc.documentElement.clientWidth || view.innerWidth;
        const height = doc.documentElement.clientHeight || view.innerHeight;
        const left = this.point.clientX - this.clickedInfo.x;
        const top = this.point.clientY - this.clickedInfo.y;
        const right = width - left - this.dragOriginRect.width;
        const bottom = height - top - this.dragOriginRect.height;

        if (this.__between(top, this.NO_SNAP, this.FULLSCREEN_MARGIN) ||
            this.__between(left, this.NO_SNAP, this.FULLSCREEN_MARGIN) ||
            this.__between(right, this.NO_SNAP, this.FULLSCREEN_MARGIN) ||
            this.__between(bottom, this.NO_SNAP, this.FULLSCREEN_MARGIN))
            return { x: 0, y: 0, w: width, h: height };
        if (this.__between(top, this.NO_SNAP, this.SNAP_MARGIN))
            return { x: 0, y: 0, w: width, h: height / 2 };
        if (this.__between(left, this.NO_SNAP, this.SNAP_MARGIN))
            return { x: 0, y: 0, w: width / 2, h: height };
        if (this.__between(right, this.NO_SNAP, this.SNAP_MARGIN))
            return { x: width / 2, y: 0, w: width / 2, h: height };
        if (this.__between(bottom, this.NO_SNAP, this.SNAP_MARGIN))
            return { x: 0, y: height / 2, w: width, h: height / 2 };
        return null;
    },

    _applyViewportSnap: function ({ x, y, w, h }) {
        const style = this.el.style;
        style.position = "fixed";
        style.removeProperty("inset");
        style.left = x + "px";
        style.top = y + "px";
        style.right = "auto";
        style.bottom = "auto";
        style.width = w + "px";
        style.height = h + "px";
        style.boxSizing = "border-box";
    },

    __animate: function () {
        let c_info = this.clickedInfo;

        let eventName = null;

        if (c_info && c_info.isMoving) {
            /** 
             * Ghost Process
             **/

            const snapArea = this._getViewportSnapArea();
            const ghost_info = snapArea
                ? { ...snapArea, type: "show" }
                : {
                    x: this.point.clientX - this.clickedInfo.x,
                    y: this.point.clientY - this.clickedInfo.y,
                    w: this.dragOriginRect.width,
                    h: this.dragOriginRect.height,
                    type: "hide"
                };

            if (ghost_info && !this.dropQuerySelector &&
                !(this.snapQuerySelector && this.reference) && !this.isParked && !this.isSnap) {
                this._snapGhostProcess(ghost_info)
            }

            if (this.isSnap) this.isSnap = false;
            this._moveDragPreview();

            eventName = "element-moving";
            if (c_info.isChangeStart) {
                this.clickedInfo.isChangeStart = false;
                eventName = "element-movestart";
            }

            this.createEvent(eventName)
            return;
        }
    },

    minMax() {
        if (!this.isSnap) {
            this.isSnap = true;
            this.preSnapped = { x: this.rect.x, y: this.rect.y, width: this.rect.width, height: this.rect.height };
            this.__setBound(this.el, 0, 0, "100%", "100%");
        } else {
            this.isSnap = false;
            this.el.style.left = this.preSnapped.x + 'px';
            this.el.style.top = this.preSnapped.y + 'px';
            this.el.style.width = this.preSnapped.width + 'px';
            this.el.style.height = this.preSnapped.height + 'px';
        }
    },


    /**
     * Position Events
     * move: element-moving, element-moveend, element-movestart
     **/
    createEvent(eventName, detail = {}) {
        const event = new CustomEvent(eventName, {
            detail: { element: this.el, instance: this, reference: this.reference, ...detail }
        });
        this.el.dispatchEvent(event);
    },

    _createSnapGhost: function (ghostClass) {
        const doc = this.el.ownerDocument;
        let node = doc.createElement("div");
        if (!ghostClass) {
            ghostClass = "snap-ghost";
        }

        node.classList.add(ghostClass);
        node.style.position = "fixed";
        node.style.pointerEvents = "none";
        (doc.body || doc.documentElement).appendChild(node);
        this.snapGhostEl = node;
    },

    _snapGhostProcess: function (info) {
        this.snapGhostEl.style.left = info.x + 'px';
        this.snapGhostEl.style.top = info.y + 'px';
        this.snapGhostEl.style.width = info.w + 'px';
        this.snapGhostEl.style.height = info.h + 'px';

        if (info.type === "show") {
            if (this.snapGhostEl.style.display === 'none') {
                this.snapGhostEl.style.display = 'block'
            }
            this.snapGhostEl.style.opacity = 0.2;
        } else {
            this.snapGhostEl.setAttribute("style", "display: none;");
        }
        return;
    },

    _selectElement: function (el) {
        this._releaseSelect();
        this.container['selectedPositionElement'] = this.el
        if (this.el) {
            this.createEvent('elementSelected');
            this.el.style.zIndex = this.container.positionIndex += 1;
            this.el.classList.add('selectedPosition');
        }
    },

    _releaseSelect: function () {
        let el = this.container['selectedPositionElement']
        if (el)
            el.classList.remove("selectedPosition");
    },
}

export default position;

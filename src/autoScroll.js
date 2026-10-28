import { dispatch } from "./helpers/events.js";

const edgeSize = 48;
const maximumSpeed = 800;
const scrollOverflow = /^(auto|scroll|overlay)$/;

function parentFrame(document) {
	try { return document.defaultView?.frameElement || null; }
	catch { return null; }
}

function toParent(point, frame) {
	const rect = frame.getBoundingClientRect();
	return {
		document: frame.ownerDocument,
		x: rect.left + (frame.clientLeft + point.x) * (frame.offsetWidth ? rect.width / frame.offsetWidth : 1),
		y: rect.top + (frame.clientTop + point.y) * (frame.offsetHeight ? rect.height / frame.offsetHeight : 1)
	};
}

function toChild(point, frame, document) {
	const rect = frame.getBoundingClientRect();
	return {
		document,
		x: (point.x - rect.left) / (frame.offsetWidth ? rect.width / frame.offsetWidth : 1) - frame.clientLeft,
		y: (point.y - rect.top) / (frame.offsetHeight ? rect.height / frame.offsetHeight : 1) - frame.clientTop
	};
}

function viewport(document) {
	return {
		left: 0, top: 0,
		right: document.documentElement.clientWidth,
		bottom: document.documentElement.clientHeight
	};
}

function visibleRect(element, document) {
	const bounds = viewport(document);
	for (let node = element; node && node !== document.scrollingElement; node = node.parentElement) {
		const style = document.defaultView.getComputedStyle(node);
		const rect = node.getBoundingClientRect();
		const scaleX = node.offsetWidth ? rect.width / node.offsetWidth : 1;
		const scaleY = node.offsetHeight ? rect.height / node.offsetHeight : 1;
		if (node === element || style.overflowX !== "visible") {
			bounds.left = Math.max(bounds.left, rect.left + node.clientLeft * scaleX);
			bounds.right = Math.min(bounds.right, rect.left + (node.clientLeft + node.clientWidth) * scaleX);
		}
		if (node === element || style.overflowY !== "visible") {
			bounds.top = Math.max(bounds.top, rect.top + node.clientTop * scaleY);
			bounds.bottom = Math.min(bounds.bottom, rect.top + (node.clientTop + node.clientHeight) * scaleY);
		}
	}
	return bounds;
}

function edgeVelocity(point, rect) {
	if (point.x < rect.left || point.x > rect.right || point.y < rect.top || point.y > rect.bottom)
		return 0;
	const edge = Math.min(edgeSize, (rect.bottom - rect.top) / 3);
	if (edge <= 0) return 0;
	const top = Math.max(0, 1 - (point.y - rect.top) / edge);
	const bottom = Math.max(0, 1 - (rect.bottom - point.y) / edge);
	return maximumSpeed * (bottom * bottom - top * top);
}

/** Scroll the containers under an active drag pointer, including same-origin frames. */
export function createAutoScroll({ element, isActive, onScroll, onCancel }) {
	const ownerDocument = element.ownerDocument;
	let rootDocument = ownerDocument;
	const ownerFrames = [];
	for (let frame; (frame = parentFrame(rootDocument)); rootDocument = frame.ownerDocument)
		ownerFrames.push(frame);
	const view = rootDocument.defaultView;
	const controller = new AbortController();
	const documents = new Set();
	let pointer = null, animation = null, previousTime = null;
	let scrollTarget = null, remainder = 0, direction = 0, stopped = false;

	function update(point) {
		if (stopped || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
		let current = point;
		while (current.document !== rootDocument) {
			const frame = parentFrame(current.document);
			if (!frame) return;
			current = toParent(current, frame);
		}
		pointer = current;
	}

	function stop() {
		if (stopped) return;
		stopped = true;
		controller.abort();
		if (animation !== null) view.cancelAnimationFrame(animation);
		animation = null;
		pointer = null;
		documents.clear();
	}

	function cancel() {
		if (stopped) return;
		stop();
		onCancel();
	}

	function watch(document) {
		if (documents.has(document)) return;
		documents.add(document);
		const options = { capture: true, signal: controller.signal };
		const move = event => {
			const point = event.touches?.[0] || event;
			update({ x: point.clientX, y: point.clientY, document });
		};
		document.addEventListener("mousemove", move, options);
		document.addEventListener("touchmove", move, options);
		for (const event of ["mouseup", "touchend"])
			document.addEventListener(event, stop, options);
		document.addEventListener("touchcancel", cancel, options);
		document.defaultView.addEventListener("blur", cancel, { signal: controller.signal });
		document.addEventListener("visibilitychange", () => {
			if (document.hidden) cancel();
		}, { signal: controller.signal });
	}

	function targetsAt(point) {
		watch(point.document);
		const targets = [];
		const target = point.document.elementsFromPoint(point.x, point.y).find(node =>
			node !== element && !element.contains(node) &&
			!node.closest(".position-moving-preview, [position-marker]"));
		if (!target) return targets;
		if (target.localName === "iframe") {
			try {
				const document = target.contentDocument;
				if (document?.documentElement)
					targets.push(...targetsAt(toChild(point, target, document)));
			} catch { /* Cross-origin frames keep their own scrolling boundary. */ }
		}
		targets.push({ ...point, element: target });
		return targets;
	}

	function findScroll(targets) {
		for (const point of targets) {
			const document = point.document;
			const root = document.scrollingElement;
			const candidates = [];
			for (let node = point.element; node; node = node.parentElement) {
				if (node !== root) candidates.push(node);
			}
			if (root) candidates.push(root);
			for (const node of candidates) {
				let overflow = document.defaultView.getComputedStyle(node).overflowY;
				if (node === root && overflow === "visible" && document.body)
					overflow = document.defaultView.getComputedStyle(document.body).overflowY;
				if (node === root ? /^(hidden|clip)$/.test(overflow) : !scrollOverflow.test(overflow)) continue;
				if (node.scrollHeight <= node.clientHeight) continue;
				const velocity = edgeVelocity(point, visibleRect(node, document));
				if (velocity < 0 ? node.scrollTop > 0 : velocity > 0 &&
					node.scrollTop < node.scrollHeight - node.clientHeight - 1)
					return { node, velocity };
			}
		}
		return null;
	}

	function tick(time) {
		try { scrollFrame(time); }
		catch (error) {
			cancel();
			dispatch(element, "position-error", { error, feature: "auto-scroll" });
		}
	}

	function scrollFrame(time) {
		animation = null;
		if (stopped || !isActive()) return stop();
		if (!element.isConnected || ownerFrames.some(frame => !frame.isConnected)) return cancel();
		const elapsed = previousTime === null ? 1 / 60 : Math.min(time - previousTime, 32) / 1000;
		previousTime = time;
		if (pointer) {
			const scrolling = findScroll(targetsAt(pointer));
			if (scrolling) {
				const { node, velocity } = scrolling;
				if (scrollTarget !== node || direction !== Math.sign(velocity)) remainder = 0;
				scrollTarget = node;
				direction = Math.sign(velocity);
				remainder += velocity * elapsed;
				const amount = Math.trunc(remainder);
				remainder -= amount;
				const before = node.scrollTop;
				if (amount) node.scrollBy({ top: amount, left: 0, behavior: "instant" });
				if (node.scrollTop !== before) {
					const reference = targetsAt(pointer)[0];
					let ownerPoint = pointer;
					for (const frame of [...ownerFrames].reverse())
						ownerPoint = toChild(ownerPoint, frame, frame.contentDocument);
					if (reference) onScroll({ clientX: ownerPoint.x, clientY: ownerPoint.y }, reference);
				}
			} else {
				scrollTarget = null;
				remainder = 0;
			}
		}
		if (!stopped) animation = view.requestAnimationFrame(tick);
	}

	watch(rootDocument);
	watch(ownerDocument);
	animation = view.requestAnimationFrame(tick);
	return { update, stop };
}

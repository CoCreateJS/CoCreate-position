import { getValueFromObject } from "@cocreate/utils";

export function resolveEventOperator(query, event) {
	if (typeof query !== "string" || !query.startsWith("event."))
		return { handled: false, value: undefined, selector: null };

	const [, path, remaining = ""] = query.match(/^event\.([^\s]+)(?:\s+([\s\S]*))?$/) || [];
	if (!path) return { handled: true, value: undefined, selector: null };

	return {
		handled: true,
		value: getValueFromObject(event, path),
		selector: remaining.trim() || "$this"
	};
}

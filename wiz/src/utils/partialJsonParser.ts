// This will crash on some cases like {"key"
// In case it crash, the last valid value stored is the max length you can parse
// maybe make this more robust later, but it is non-trivial
export const partialParse = text => {
	let tail: string[] = [];
	let quoted = false;
	let charIdx = 0;
	let newText = text;

	while (charIdx < newText.length) {
		if (
			newText[charIdx] === '\\' &&
			charIdx + 1 < newText.length &&
			newText[charIdx + 1] === '"'
		) {
			// skip escaped quotes
			charIdx += 1;
		} else if (newText[charIdx] === '"') {
			// toggle quoted
			quoted = !quoted;
		} else if (!quoted) {
			// skip bracket characters inside quotes
			if (newText[charIdx] === '{') {
				tail.push('}');
			} else if (newText[charIdx] === '[') {
				tail.push(']');
			} else if (newText[charIdx] === '}') {
				tail.splice(tail.lastIndexOf('}'), 1);
			} else if (newText[charIdx] === ']') {
				tail.splice(tail.lastIndexOf(']'), 1);
			}
		}
		charIdx += 1;
	}

	// close quote if open
	if (quoted) {
		newText += '"';
	}

	// remove trailing commas
	let lastIdx = text.length - 1;
	while (newText[lastIdx].match(/\s/) !== null) {
		lastIdx--;
	}
	if (newText[lastIdx] === ',') {
		newText = newText.slice(0, lastIdx);
	}
	
	return JSON.parse(newText + tail.reverse().join(''));
};
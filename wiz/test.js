const getLastNonWhitespaceIdx = s => {
	let i = s.length - 1;
	while (s[i].match(/\s/) !== null) {
		i--;
	}
	return i;
};

const partialParse = text => {
	let tail = [];
	let quoted = false;
	let charIdx = 0;
	let newText = text;
	let quoteCount = 0;

	while (charIdx < newText.length) {
		if (newText[charIdx] === '\\' && newText[charIdx + 1] === '"') {
			// skip escaped quotes
			charIdx += 1;
		} else if (newText[charIdx] === '"') {
			// toggle quoted
			quoted = !quoted;
			if (tail[tail.length - 1] === '}') {
				quoteCount += 1;
			}
		} else if (!quoted) {
			// skip bracket characters inside quotes
			if (newText[charIdx] === '{') {
				tail.push('}');
				quoteCount = 0;
			} else if (newText[charIdx] === '[') {
				tail.push(']');
				quoteCount = 0;
			} else if (newText[charIdx] === '}') {
				tail.splice(tail.lastIndexOf('}'), 1);
				quoteCount = 0;
			} else if (newText[charIdx] === ']') {
				tail.splice(tail.lastIndexOf(']'), 1);
				quoteCount = 0;
			}
		}
		charIdx += 1;
	}

	// close quote if open
	if (quoted) {
		newText += '"';
	}

	// add comma when the last key/value pair has 3 or 4 quotes
	let lastIdx = getLastNonWhitespaceIdx(newText);
	if (
		tail[tail.length - 1] === '}' &&
		(quoteCount % 4 === 3 || (quoteCount % 4 === 0 && newText[lastIdx] !== ','))
	) {
		newText += ',';
	}
	console.log(newText);

	if (tail[tail.length - 1] === '}' && newText[newText.length - 1] !== ']') {
		let insideLiteral = false;
		let lastKV = '';
		let metAColon = false;
		let j;

		for (j = newText.length - 1; j > 0; j--) {
			if (newText[j] === ':') {
				if (!insideLiteral) {
					metAColon = true;
					insideLiteral = false;
				}
			} else if (newText[j] === '{') {
				if (!insideLiteral) {
					if (!metAColon) {
						lastKV = '';
					}
					j++;
					break;
				}
			} else if (newText[j] === ',') {
				if (!insideLiteral) {
					if (!metAColon) {
						lastKV = '';
					}
					break;
				}
			} else {
				// TODO: handle escaped quotes
				if (newText[j] === '"' && newText[j - 1] !== '\\') {
					insideLiteral = !insideLiteral;
				}
				if (!metAColon) {
					if (j !== newText.length - 1 || newText[j] !== '}') {
						lastKV = lastKV + newText[j];
					}
				}
			}
		}

		lastKV = lastKV.split('').reverse().join('');

		if (
			lastKV !== 'false' &&
			lastKV !== 'true' &&
			lastKV !== 'null' &&
			lastKV.match(/^\d+$/) === null &&
			!(
				lastKV.length !== 1 &&
				lastKV[0] === '"' &&
				lastKV[lastKV.length - 1] === '"'
			)
		) {
			newText = newText.slice(0, j);
		}
	} else if (tail[tail.length - 1] === ']') {
		let insideLiteral = false;
		let j;
		for (j = newText.length - 1; j > 0; j--) {
			if (!insideLiteral && (newText[j] === ',' || newText[j] === '[')) {
				j++;
				break;
			} else if (newText[j] === '"' && newText[j - 1] !== '\\') {
				insideLiteral = !insideLiteral;
			}
		}

		let lastV = newText.slice(j, newText.length).trim();
		if (
			lastV !== 'false' &&
			lastV !== 'true' &&
			lastV !== 'null' &&
			lastV.match(/^\d+$/) === null &&
			!(
				lastV.length !== 1 &&
				lastV[0] === '"' &&
				lastV[lastV.length - 1] === '"'
			)
		) {
			newText = newText.slice(0, j);
		}
	}

	// remove trailing commas
	lastIdx = getLastNonWhitespaceIdx(newText);
	if (newText[lastIdx] === ',') {
		newText = newText.slice(0, lastIdx);
	}

	return newText + tail.reverse().join('');
};

// const text = '{"hello": "world"';
// const text = '{"hello": "world';
// const text = '[{"hello": "world"},';
// const text = '[{"hello": "world"}, {"hello": "world"';
// const text = '[{"hello": "world{\\"test\\"}"}, {"hello": "world"';
// const text = '[[["test", {"hello"';
const text =
	'[[["test1", 123, true, false, null, {"key1": "value2", "key2": "value2", {"key3": null, [1, 2, 3, "test quote \\""]}}], "test2"], "test3", "{\\"hello\\": \\"world\\"}"]';
console.log(text);
for (let i = 0; i < text.length; i++) {
	console.log(JSON.stringify(JSON.parse(partialParse(text.slice(0, i + 1)))));
}

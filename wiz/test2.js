// original repo: https://github.com/indgov/partial-json-parser

export const partialParse = function (s) {
	var tail = [];

	s = s.replace(/\r\n/g, '');
	for (let i = 0; i < s.length; i++) {
		if (s[i] === '{') {
			tail.push('}');
		} else if (s[i] === '[') {
			tail.push(']');
		} else if (s[i] === '}') {
			tail.splice(tail.lastIndexOf('}'), 1);
		} else if (s[i] === ']') {
			tail.splice(tail.lastIndexOf(']'), 1);
		}
	}

	if (tail[tail.length - 1] === '}') {
		// Ignore checking if the last key is an array:
		if (s[s.length - 1] !== ']') {
			let insideLiteral = (s.split(/."/).length - 1) % 2 === 1 ? true : false; // If there are an odd number of double quotes, then we are in a string
			let lastKV = '';
			let metAColon = false;
			let j;

			for (j = s.length - 1; j > 0; j--) {
				if (s[j] === ':') {
					if (!insideLiteral) {
						metAColon = true;
						insideLiteral = false;
					}
				} else if (s[j] === '{') {
					if (!insideLiteral) {
						if (!metAColon) {
							lastKV = '';
						}
						j++;
						break;
					}
				} else if (s[j] === ',') {
					if (!insideLiteral) {
						if (!metAColon) {
							lastKV = '';
						}
						break;
					}
				} else {
					if (s[j] === '"') {
						insideLiteral = !insideLiteral;
					}
					if (!metAColon) {
						if (j !== s.length - 1 || s[j] !== '}') {
							lastKV = lastKV + s[j];
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
				s = s.slice(0, j);
			}
		}
	} else if (tail[tail.length - 1] === ']') {
		if ((s.slice(s.lastIndexOf('[')).split('"').length - 1) % 2 === 1) {
			s = s.slice(0, s.lastIndexOf('"'));
		}
	}
	let lastCharacter = getNonWhitespaceCharacterOfStringAt(s, s.length - 1);
	if (lastCharacter.character === ',') {
		s = s.slice(0, lastCharacter.index);
	}
	tail = tail.reverse();
	return JSON.parse(s + tail.join(''));
};

const getNonWhitespaceCharacterOfStringAt = (s, i) => {
	while (s[i].match(/\s/) !== null) {
		i--;
	}
	return {
		character: s[i],
		index: i,
	};
}

const text = '[[["test", true';
console.log(partialParse(text));
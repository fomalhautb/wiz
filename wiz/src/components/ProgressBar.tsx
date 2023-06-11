import React, {useState} from 'react';
import {Box, type DOMElement, Text, measureElement} from 'ink';
import figures from 'figures';

type ProgressBarProps = {
	value: number;
	color?: string;
};

const ProgressBar = ({value, color}: ProgressBarProps) => {
	const [width, setWidth] = useState(0);

	// eslint-disable-next-line @typescript-eslint/ban-types
	const [ref, setRef] = useState<DOMElement | null>(null);

	if (ref) {
		const dimensions = measureElement(ref);

		if (dimensions.width !== width) {
			setWidth(dimensions.width);
		}
	}

	const progress = Math.min(100, Math.max(0, value));
	const complete = Math.round((progress / 100) * width);
	const remaining = width - complete;

	return (
		<Box ref={setRef} flexGrow={1} minWidth={0}>
			{complete > 0 && (
				<Text color={color || 'green'}>{figures.square.repeat(complete)}</Text>
			)}

			{remaining > 0 && (
				<Text dimColor>{figures.squareLightShade.repeat(remaining)}</Text>
			)}
		</Box>
	);
};

export default ProgressBar;

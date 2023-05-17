import React from 'react';
import {Box, Text} from 'ink';

type Props = {
	text?: string;
	location?: 'left' | 'center' | 'right';
};

const Divider = ({text, location}: Props) => {
	const line = (
		<Box
			borderStyle="single"
			borderColor={'grey'}
			borderLeft={false}
			borderRight={false}
			borderBottom={false}
			flexGrow={1}
		/>
	);

	return (
		<Box>
			{location !== 'left' ? line : null}
			{text ? <Text backgroundColor={'grey'}> {text} </Text> : null}
			{location !== 'right' ? line : null}
		</Box>
	);
};

Divider.defaultProps = {
	location: 'center',
};

export default Divider;

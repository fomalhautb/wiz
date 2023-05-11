import React from 'react';
import Selection  from './components/Selection.js';
import { Box } from 'ink';
import Divider from './components/Devider.js';

type Props = {
	prompt: string,
};

export default function App({ prompt } : Props) {
	return (
		<Box flexDirection='column'>
			<Divider text={'Actions'} />
			<Selection items={[
				{text: '✅ Execute command'}, 
				{text: '🎯 Revise query'},
				{text: '✏️  Edit myself'},
				{text: '❌ Cancel'}
			]} />
		</Box>
	);
}

import React from 'react';
import Selection from './components/Selection.js';

export default function App() {
	return (
		<Selection items={[
			{text: '✅ Execute command'}, 
			{text: '🎯 Revise query'},
			{text: '✏️  Edit myself'},
			{text: '❌ Cancel'}
		]} />
	);
}

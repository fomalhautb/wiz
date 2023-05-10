import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';

type Props = {
  items: {
    text: string;
  }[],
  onClose?: (index: number) => void,
};

export default function Selection({ items, onClose }: Props) {
  const [selectedItem, setSelectedItem] = useState(0);

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedItem((oldItem) => (oldItem > 0 ? oldItem - 1 : items.length - 1));
    } else if (key.downArrow) {
      setSelectedItem((oldItem) => (oldItem < items.length - 1 ? oldItem + 1 : 0));
    } else if (!isNaN(parseInt(input))) {
      const numberInput = parseInt(input);
      if (numberInput >= 1 && numberInput <= items.length) {
        setSelectedItem(numberInput - 1);
      }
    } else if (key.return) {
      onClose?.(selectedItem);
    }
  });

  return (
    <Box flexDirection="column">
      {items.map((item, index) => (
        <Text key={index} color={index === selectedItem ? 'cyan' : 'white'}>
          {(index === selectedItem ? '>' : ' ') + ' ' + (index + 1) + '. ' + item.text}
        </Text>
      ))}
    </Box>
  );
}

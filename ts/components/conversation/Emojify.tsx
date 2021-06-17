import React from 'react';

import { getRegex, SizeClassType } from '../../util/emoji';

import { RenderTextCallbackType } from '../../types/Util';
import { Twemoji } from 'react-emoji-render';

interface Props {
  text: string;
  /** A class name to be added to the generated emoji images */
  sizeClass?: SizeClassType;
  /** Allows you to customize now non-newlines are rendered. Simplest is just a <span>. */
  renderNonEmoji?: RenderTextCallbackType;
  isGroup?: boolean;
  convoId: string;
}

export class Emojify extends React.Component<Props> {
  public static defaultProps: Partial<Props> = {
    renderNonEmoji: ({ text }) => text || '',
    isGroup: false,
  };

  public render() {
    const { text, sizeClass, renderNonEmoji, isGroup, convoId } = this.props;
    const results: Array<any> = [];
    const regex = getRegex();

    // We have to do this, because renderNonEmoji is not required in our Props object,
    //  but it is always provided via defaultProps.
    if (!renderNonEmoji) {
      return null;
    }

    let match = regex.exec(text);
    let last = 0;
    let count = 1;

    if (!match) {
      return renderNonEmoji({ text, key: 0, isGroup, convoId });
    }

    while (match) {
      if (last < match.index) {
        const textWithNoEmoji = text.slice(last, match.index);
        results.push(
          renderNonEmoji({
            text: textWithNoEmoji,
            key: count++,
            isGroup,
            convoId,
          })
        );
      }

      let size = 1.0;
      switch (sizeClass) {
        case 'jumbo':
          size = 2.0;
          break;
        case 'large':
          size = 1.8;
          break;
        case 'medium':
          size = 1.5;
          break;
        case 'small':
          size = 1.1;
          break;
        default:
      }

      const style = { fontSize: `${size}em` };

      const emojiText = match[0] ?? match[1];

      results.push(
        <span style={style} key={count++}>
          <Twemoji
            key={count}
            text={emojiText}
            options={
              {
                baseUrl: 'images/twemoji/',
                protocol: '',
                ext: 'png',
              } as any
            }
          />
        </span>
      );

      last = regex.lastIndex;
      match = regex.exec(text);
    }

    if (last < text.length) {
      results.push(
        renderNonEmoji({
          text: text.slice(last),
          key: count++,
          isGroup,
          convoId,
        })
      );
    }

    return results;
  }
}

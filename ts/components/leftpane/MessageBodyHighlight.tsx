import React from 'react';
import { RenderTextCallbackType } from '../../types/Util';
import { SizeClassType } from '../../util/emoji';
import { AddNewLines } from '../conversation/AddNewLines';
import { Emojify } from '../conversation/Emojify';
import { MessageBody } from '../conversation/message/message-content/MessageBody';

interface Props {
  text: string;
}

const renderNewLines: RenderTextCallbackType = ({ text, key }) => (
  <AddNewLines key={key} text={text} />
);

const renderEmoji = ({
  text,
  key,
  sizeClass,
  renderNonEmoji,
}: {
  text: string;
  key: number;
  sizeClass?: SizeClassType;
  renderNonEmoji: RenderTextCallbackType;
}) => <Emojify key={key} text={text} sizeClass={sizeClass} renderNonEmoji={renderNonEmoji} />;

export class MessageBodyHighlight extends React.Component<Props> {
  public render() {
    const { text } = this.props;
    const results: Array<any> = [];
    const FIND_BEGIN_END = /<<left>>(.+?)<<right>>/g;

    let match = FIND_BEGIN_END.exec(text);
    let last = 0;
    let count = 1;

    if (!match) {
      return <MessageBody disableJumbomoji={true} disableLinks={true} text={text} />;
    }

    const sizeClass = '';

    while (match) {
      if (last < match.index) {
        const beforeText = text.slice(last, match.index);
        results.push(
          renderEmoji({
            text: beforeText,
            sizeClass,
            key: count++,
            renderNonEmoji: renderNewLines,
          })
        );
      }

      const [, toHighlight] = match;
      results.push(
        <span className="module-message-body__highlight" key={count++}>
          {renderEmoji({
            text: toHighlight,
            sizeClass,
            key: count++,
            renderNonEmoji: renderNewLines,
          })}
        </span>
      );

      // @ts-ignore
      last = FIND_BEGIN_END.lastIndex;
      match = FIND_BEGIN_END.exec(text);
    }

    if (last < text.length) {
      results.push(
        renderEmoji({
          text: text.slice(last),
          sizeClass,
          key: count++,
          renderNonEmoji: renderNewLines,
        })
      );
    }

    return results;
  }
}

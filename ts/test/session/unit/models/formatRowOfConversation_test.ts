// tslint:disable: no-implicit-dependencies max-func-body-length no-unused-expression

import { expect } from 'chai';
import { describe } from 'mocha';
import {
  ConversationAttributes,
  ConversationTypeEnum,
  fillConvoAttributesWithDefaults,
} from '../../../../models/conversationAttributes';
import { formatRowOfConversation } from '../../../../node/database_utility';

// tslint:disable-next-line: max-func-body-length
describe('formatRowOfConversation', () => {
  describe('isTrustedForAttachmentDownload', () => {
    it('initialize isTrustedForAttachmentDownload if they are not given', () => {
      expect(formatRowOfConversation({})).to.have.deep.property(
        'isTrustedForAttachmentDownload',
        false
      );
    });

    it('do not override isTrustedForAttachmentDownload if they are set in the row as integer: true', () => {
      expect(formatRowOfConversation({ isTrustedForAttachmentDownload: 1 })).to.have.deep.property(
        'isTrustedForAttachmentDownload',
        true
      );
    });

    it('do not override isTrustedForAttachmentDownload if they are set in the row as integer: false', () => {
      expect(formatRowOfConversation({ isTrustedForAttachmentDownload: 0 })).to.have.deep.property(
        'isTrustedForAttachmentDownload',
        false
      );
    });
  });

  describe('isPinned', () => {
    it('initialize isPinned if they are not given', () => {
      expect(formatRowOfConversation({})).to.have.deep.property('isPinned', false);
    });

    it('do not override isPinned if they are set in the row as integer: true', () => {
      expect(formatRowOfConversation({ isPinned: 1 })).to.have.deep.property('isPinned', true);
    });

    it('do not override isPinned if they are set in the row as integer: false', () => {
      expect(formatRowOfConversation({ isPinned: 0 })).to.have.deep.property('isPinned', false);
    });
  });

  describe('isApproved', () => {
    it('initialize isApproved if they are not given', () => {
      expect(formatRowOfConversation({})).to.have.deep.property('isApproved', false);
    });

    it('do not override isApproved if they are set in the row as integer: true', () => {
      expect(formatRowOfConversation({ isApproved: 1 })).to.have.deep.property('isApproved', true);
    });

    it('do not override isApproved if they are set in the row as integer: false', () => {
      expect(formatRowOfConversation({ isApproved: 0 })).to.have.deep.property('isApproved', false);
    });
  });

  describe('didApproveMe', () => {
    it('initialize didApproveMe if they are not given', () => {
      expect(formatRowOfConversation({})).to.have.deep.property('didApproveMe', false);
    });

    it('do not override didApproveMe if they are set in the row as integer: true', () => {
      expect(formatRowOfConversation({ didApproveMe: 1 })).to.have.deep.property(
        'didApproveMe',
        true
      );
    });

    it('do not override didApproveMe if they are set in the row as integer: false', () => {
      expect(formatRowOfConversation({ didApproveMe: 0 })).to.have.deep.property(
        'didApproveMe',
        false
      );
    });
  });

  describe('is_medium_group', () => {
    it('initialize is_medium_group if they are not given', () => {
      expect(formatRowOfConversation({})).to.have.deep.property('is_medium_group', false);
    });

    it('do not override is_medium_group if they are set in the row as integer: true', () => {
      expect(formatRowOfConversation({ is_medium_group: 1 })).to.have.deep.property(
        'is_medium_group',
        true
      );
    });

    it('do not override is_medium_group if they are set in the row as integer: false', () => {
      expect(formatRowOfConversation({ is_medium_group: 0 })).to.have.deep.property(
        'is_medium_group',
        false
      );
    });
  });

  describe('mentionedUs', () => {
    it('initialize mentionedUs if they are not given', () => {
      expect(formatRowOfConversation({})).to.have.deep.property('mentionedUs', false);
    });

    it('do not override mentionedUs if they are set in the row as integer: true', () => {
      expect(formatRowOfConversation({ mentionedUs: 1 })).to.have.deep.property(
        'mentionedUs',
        true
      );
    });

    it('do not override mentionedUs if they are set in the row as integer: false', () => {
      expect(formatRowOfConversation({ mentionedUs: 0 })).to.have.deep.property(
        'mentionedUs',
        false
      );
    });
  });

  describe('isKickedFromGroup', () => {
    it('initialize isKickedFromGroup if they are not given', () => {
      expect(formatRowOfConversation({})).to.have.deep.property('isKickedFromGroup', false);
    });

    it('do not override isKickedFromGroup if they are set in the row as integer: true', () => {
      expect(formatRowOfConversation({ isKickedFromGroup: 1 })).to.have.deep.property(
        'isKickedFromGroup',
        true
      );
    });

    it('do not override isKickedFromGroup if they are set in the row as integer: false', () => {
      expect(formatRowOfConversation({ isKickedFromGroup: 0 })).to.have.deep.property(
        'isKickedFromGroup',
        false
      );
    });
  });

  describe('left', () => {
    it('initialize left if they are not given', () => {
      expect(formatRowOfConversation({})).to.have.deep.property('left', false);
    });

    it('do not override left if they are set in the row as integer: true', () => {
      expect(formatRowOfConversation({ left: 1 })).to.have.deep.property('left', true);
    });

    it('do not override left if they are set in the row as integer: false', () => {
      expect(formatRowOfConversation({ left: 0 })).to.have.deep.property('left', false);
    });
  });

  describe('row', () => {
    it('row null returns null', () => {
      expect(formatRowOfConversation(null as any)).to.be.equal(
        null,
        'formatRowOfConversation with null should return null'
      );
    });

    it('row undefined returns null', () => {
      expect(formatRowOfConversation(undefined as any)).to.be.equal(
        null,
        'formatRowOfConversation with undefined should return null'
      );
    });
  });

  describe('groupAdmins', () => {
    it('groupAdmins undefined fills it with []', () => {
      expect(formatRowOfConversation({ groupAdmins: undefined })).to.be.have.deep.property(
        'groupAdmins',
        []
      );
    });

    it('groupAdmins null fills it with []', () => {
      expect(formatRowOfConversation({ groupAdmins: null })).to.be.have.deep.property(
        'groupAdmins',
        []
      );
    });

    it('groupAdmins [] fills it with []', () => {
      expect(formatRowOfConversation({ groupAdmins: '[]' })).to.be.have.deep.property(
        'groupAdmins',
        []
      );
    });

    it('groupAdmins ["12345"] from db as string', () => {
      expect(
        formatRowOfConversation({ groupAdmins: '["12345"]' })
      ).to.be.have.deep.property('groupAdmins', ['12345']);
    });

    it('groupAdmins ["12345", "52345"] fills it with []', () => {
      expect(
        formatRowOfConversation({ groupAdmins: '["12345", "52345"]' })
      ).to.be.have.deep.property('groupAdmins', ['12345', '52345']);
    });
  });

  describe('members', () => {
    it('members undefined fills it with []', () => {
      expect(formatRowOfConversation({ members: undefined })).to.be.have.deep.property(
        'members',
        []
      );
    });

    it('members null fills it with []', () => {
      expect(formatRowOfConversation({ members: null })).to.be.have.deep.property('members', []);
    });

    it('members [] fills it with []', () => {
      expect(formatRowOfConversation({ members: '[]' })).to.be.have.deep.property('members', []);
    });

    it('members ["12345"] from db as string', () => {
      expect(formatRowOfConversation({ members: '["12345"]' })).to.be.have.deep.property(
        'members',
        ['12345']
      );
    });

    it('members ["12345", "52345"] fills it with []', () => {
      expect(
        formatRowOfConversation({ members: '["12345", "52345"]' })
      ).to.be.have.deep.property('members', ['12345', '52345']);
    });
  });

  describe('zombies', () => {
    it('zombies undefined fills it with []', () => {
      expect(formatRowOfConversation({ zombies: undefined })).to.be.have.deep.property(
        'zombies',
        []
      );
    });

    it('zombies null fills it with []', () => {
      expect(formatRowOfConversation({ zombies: null })).to.be.have.deep.property('zombies', []);
    });

    it('zombies [] fills it with []', () => {
      expect(formatRowOfConversation({ zombies: '[]' })).to.be.have.deep.property('zombies', []);
    });

    it('zombies ["12345"] from db as string', () => {
      expect(formatRowOfConversation({ zombies: '["12345"]' })).to.be.have.deep.property(
        'zombies',
        ['12345']
      );
    });

    it('zombies ["12345", "52345"] fills it with ["12345", "52345"]', () => {
      expect(
        formatRowOfConversation({ zombies: '["12345", "52345"]' })
      ).to.be.have.deep.property('zombies', ['12345', '52345']);
    });
  });

  it('throws an error if a key is not expected', () => {
    expect(() => formatRowOfConversation({ not_valid: undefined })).throws(
      'formatRowOfConversation: an invalid key was given in the record: not_valid'
    );
  });

  it('throws an error if a key is not expected but has other valid keys', () => {
    expect(() =>
      formatRowOfConversation({ triggerNotificationsFor: 'all', not_valid: undefined })
    ).throws('formatRowOfConversation: an invalid key was given in the record: not_valid');
  });

  it('a field with default ConversationModel attributes does not throw', () => {
    expect(
      formatRowOfConversation(
        fillConvoAttributesWithDefaults({
          id: '123456',
          type: ConversationTypeEnum.GROUP,
          nickname: 'nickname',
          displayNameInProfile: 'displayNameInProfile',
          profileKey: '',
          avatarPointer: 'avatarPointer',
          avatarInProfile: 'avatarInProfile',
          avatarImageId: 1234,
        } as ConversationAttributes)
      )
    ).have.deep.property('displayNameInProfile', 'displayNameInProfile');
  });
});

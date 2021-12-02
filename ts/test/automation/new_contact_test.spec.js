"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_1 = require("@playwright/test");
const new_user_1 = require("./new_user");
const log_in_1 = require("./log_in");
const open_1 = require("./open");
const clean_up_1 = require("./clean_up");
const userADisplayName = 'userA';
const userBDisplayName = 'userB';
// Send message in one to one conversation with new contact
test_1.test('Send message to new contact', async () => {
    const [window, window2] = await Promise.all([open_1.openApp('1'), open_1.openApp('2')]);
    // create userA 
    const userA = await new_user_1.newUser(window, userADisplayName);
    // log out of UserA
    // await cleanUp(window);
    // create userB
    const userB = await new_user_1.newUser(window2, userBDisplayName);
    // SEND MESSAGE TO USER A
    // Click + button for new conversation
    await window.click('[data-testid=new-conversation-button]');
    // Enter session ID of USER B
    await window.fill('.session-id-editable-textarea', userB.sessionid);
    // click next
    await window.click('[data-testid=next-button');
    // type into message input box
    await window.fill('.send-message-input', 'Sending test message');
    // click up arrow (send)
    await window.click('[data-testid=send-message-button');
    // confirm that tick appears next to message
    await window.waitForSelector('[data-testid=msg-status-outgoing]');
    await window.waitForSelector(`[data-test-name=convo-item-${userADisplayName}]`);
    // log out of User B
    await clean_up_1.cleanUp(window);
    // login as User A
    await log_in_1.logIn(window, userA.userName, userA.recoveryPhrase);
    // Navigate to conversation with USER B
    await window.click('[data-testid=message-section');
    // check message was delivered correctly
    await window.click();
    // Send message back to USER A
    // Check that USER A was correctly added as a contact
});
// log out from USER A
// cleanUp(window);
// test('blah', async() => {
//   const userA = newUser(window, 'user A')
//   cleanUp(window)
//   const userB = newUser(window, 'user B')
//   // SEND MESSAGE TO USER 
//   cleanUp(window)
//   logIn(window, userA.userName, userA.recoveryPhrase)
// })
//# sourceMappingURL=new_contact_test.spec.js.map
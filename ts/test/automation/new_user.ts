import { _electron, Page }  from '@playwright/test';

export const newUser = async ( window: Page, userName: string) => {
      // Create User
      await window.click('text=Create Session ID');
      // Wait for animation for finish creating ID 
      await window.waitForTimeout(1500);
      //Save session ID to a variable
      const sessionid = await window.inputValue('.session-id-editable-textarea');
      await window.click('text=Continue');
      // Input username = testuser
      await window.fill( '#session-input-floating-label', userName );
      await window.click('text=Get Started');
      
      
      return { userName, sessionid };
}
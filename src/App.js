import './App.css';
import { useEffect } from 'react';
import Terminal from 'terminal-in-react';
import pseudoFileSystemPlugin from 'terminal-in-react-pseudo-file-system-plugin';
import OnMountPlugin from './OnMountPlugin';

const FileSystemPlugin = pseudoFileSystemPlugin();

function App() {

  useEffect(() => {
    const input = document.querySelector('input[type="text"]')
    input.setAttribute('autocomplete', 'off')
    input.setAttribute('autocorrect', 'off')
    input.setAttribute('autocapitalize', 'off')
    input.setAttribute('spellcheck', 'false')

    input.addEventListener('focus', (e) => {
      setTimeout(() => {
        window.scrollTo(0,document.body.scrollHeight);
      }, 100)
    })
  })
  
  return (
    <Terminal
      plugins={[
        FileSystemPlugin,
        OnMountPlugin
      ]}
      hideTopBar={true}
      allowTabs={false}
      startState='maximised'
      color='green'
      backgroundColor='black'
      barColor='black'
      style={{ fontWeight: "bold", fontSize: "1em" }}
      commands={{
        email: () => 'My email is <a href=me@leesalminen.com. Get in touch!',
        whoami: () => '42',
      }}
      descriptions={{
        email: 'Send me an email',
        whoami: 'what is the meaning of life?',
      }}
      msg={`Hi there, I'm Lee Salminen! Parker is my boy, and Nikki is my wife. Try typing help to see a list of available commands`}
    />
  );
}

export default App;

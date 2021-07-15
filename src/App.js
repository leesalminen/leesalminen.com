import './App.css';
import Terminal from 'terminal-in-react';
import pseudoFileSystemPlugin from 'terminal-in-react-pseudo-file-system-plugin';
import OnMountPlugin from './OnMountPlugin';

const FileSystemPlugin = pseudoFileSystemPlugin();

const showMsg = () => 'Hello World'


function App() {
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
        'open-google': () => window.open('https://www.google.com/', '_blank'),
        showmsg: showMsg,
        popup: () => alert('Terminal in React')
      }}
      descriptions={{
        'open-google': 'opens google.com',
        showmsg: 'shows a message',
        alert: 'alert', 
        popup: 'alert',
      }}
      msg={`Hi there, I'm Lee Salminen! Parker is my boy, and Nikki is my ol' lady.`}
    />
  );
}

export default App;

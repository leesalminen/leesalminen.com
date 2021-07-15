import PluginBase from 'terminal-in-react/lib/js/components/Plugin';

export default class OnMountPlugin extends PluginBase {
  static displayName = 'OnMountPlugin';
  static version = '1.0.0';

  constructor(api, config) {
    super(api, config);

    setTimeout(() => {
      const createDir = this.api.getPluginMethod('PseudoFileSystem', 'createDir')
      const removeDir = this.api.getPluginMethod('PseudoFileSystem', 'removeDir')
      const parsePath = this.api.getPluginMethod('PseudoFileSystem', 'parsePath')
      
      removeDir(parsePath('/home/user'))
      createDir(parsePath('/home/lee'))
      createDir(parsePath('/home/parker'))
      createDir(parsePath('/home/nikki'))
      this.api.runCommand('cd /home');
      this.api.runCommand('touch /home/lee/README')
      this.api.runCommand('touch /home/nikki/README')
      this.api.runCommand('touch /home/parker/README')
      this.api.runCommand('echo 42 >> /home/lee/README')
      this.api.runCommand('echo hi >> /home/nikki/README')
      this.api.runCommand('echo yo >> /home/parker/README')
      
    }, 0)
  }
}
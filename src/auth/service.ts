import axios from 'axios'
import { config } from '@/shared/config'

export class AuthService {
  public server = '';
  public username = '';
  public salt = '';
  public hash = '';
  private authenticated = false;

  constructor() {
    this.server = config.serverUrl || localStorage.getItem('server') || ''
    this.username = localStorage.getItem('username') || ''
    this.salt = localStorage.getItem('salt') || ''
    this.hash = localStorage.getItem('hash') || ''
  }

  private saveSession() {
    if (!config.serverUrl) {
      localStorage.setItem('server', this.server)
    }
    localStorage.setItem('username', this.username)
    localStorage.setItem('salt', this.salt)
    localStorage.setItem('hash', this.hash)
  }

  async autoLogin(): Promise<boolean> {
    if (!this.server || !this.username) {
      return false
    }
    return this.loginWithHash(this.server, this.username, this.hash, false)
      .then(() => true)
      .catch(() => false)
  }

  async loginWithPassword(server: string, username: string, password: string, remember: boolean) {
    const hash = password
    return this.loginWithHash(server, username, hash, remember)
  }

  private async loginWithHash(
    server: string,
    username: string,
    hash: string,
    remember: boolean
  ) {
    const url = `${server}/rest/ping.view?u=${username}&p=${hash}&v=1.9.0&c=app&f=json`
    return axios.get(url)
      .then((response) => {
        const subsonicResponse = response.data['subsonic-response']
        if (!subsonicResponse || subsonicResponse.status !== 'ok') {
          const err = new Error(subsonicResponse.status)
          return Promise.reject(err)
        }
        this.authenticated = true
        this.server = server
        this.username = username
        this.hash = hash
        if (remember) {
          this.saveSession()
        }
      })
  }

  logout() {
    localStorage.clear()
    sessionStorage.clear()
  }

  isAuthenticated() {
    return this.authenticated
  }
}

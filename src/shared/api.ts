import axios, { AxiosRequestConfig, AxiosInstance } from 'axios'
import { AuthService } from '@/auth/service'

export type AlbumSort =
  'a-z' |
  'recently-added'|
  'recently-played' |
  'most-played' |
  'random'

export interface Track {
  id: string
  title: string
  duration: number
  favourite: boolean
  image?: string
  url?: string
  track?: number
  album?: string
  albumId?: string
  artist?: string
  artistId?: string
}

export interface Album {
  id: string
  name: string
  artist: string
  artistId: string
  year: number
  favourite: boolean
  genreId?: string
  image?: string
  tracks?: Track[]
}

export interface Artist {
  id: string
  name: string
  albumCount: number
  description?: string
  favourite: boolean
  lastFmUrl?: string
  musicBrainzUrl?: string
  similarArtist?: Artist[]
  albums?: Album[]
}

export interface SearchResult {
  artists: Artist[]
  albums: Album[]
  tracks: Track[]
}

export interface RadioStation {
  id: string
  title: string
  description: string
  url: string
}

export class API {
  readonly http: AxiosInstance;
  readonly get: (path: string, params?: any) => Promise<any>;
  readonly post: (path: string, params?: any) => Promise<any>;
  readonly clientName = window.origin || 'web';

  constructor(private auth: AuthService) {
    this.http = axios.create({})
    this.http.interceptors.request.use((config: AxiosRequestConfig) => {
      config.params = config.params || {}
      config.baseURL = this.auth.server
      config.params.u = this.auth.username
      config.params.s = this.auth.salt
      config.params.p = this.auth.hash
      config.params.c = this.clientName
      config.params.f = 'json'
      config.params.v = '1.9.0'
      return config
    })

    this.get = (path: string, params: any = {}) => {
      return this.http.get(path, { params }).then(response => {
        const subsonicResponse = response.data['subsonic-response']
        if (subsonicResponse.status !== 'ok') {
          const message = subsonicResponse.error?.message || subsonicResponse.status
          const err = new Error(message)
          return Promise.reject(err)
        }
        return Promise.resolve(subsonicResponse)
      })
    }

    this.post = (path: string, params: any = {}) => {
      return this.http.post(path, params).then(response => {
        const subsonicResponse = response.data['subsonic-response']
        if (subsonicResponse.status !== 'ok') {
          const err = new Error(subsonicResponse.status)
          return Promise.reject(err)
        }
        return Promise.resolve(subsonicResponse)
      })
    }
  }

  async getGenres() {
    const response = await this.get('rest/getGenres.view', {})
    return response.genres.genre
      .map((item: any) => ({
        id: item.value,
        name: item.value,
        albumCount: item.albumCount,
        trackCount: item.songCount,
      }))
      .sort((a: any, b:any) => b.albumCount - a.albumCount)
  }

  async getAlbumsByGenre(id: string, size: number, offset = 0) {
    const params = {
      type: 'byGenre',
      genre: id,
      size,
      offset,
    }
    const response = await this.get('rest/getAlbumList2.view', params)
    return (response.albumList2?.album || []).map(this.normalizeAlbum, this)
  }

  async getTracksByGenre(id: string, size: number, offset = 0) {
    const params = {
      genre: id,
      count: size,
      offset,
    }
    const response = await this.get('rest/getSongsByGenre.view', params)
    return (response.songsByGenre?.song || []).map(this.normalizeTrack, this)
  }

  async getArtists(): Promise<Artist[]> {
    const response = await this.get('rest/getArtists.view')
    return (response.artists?.index || [])
      .flatMap((index: any) => index.artist)
      .map(this.normalizeArtist, this)
  }

  async getAlbums(sort: AlbumSort, size: number, offset = 0): Promise<Album[]> {
    const type = {
      'a-z': 'alphabeticalByName',
      'recently-added': 'newest',
      'recently-played': 'recent',
      'most-played': 'frequent',
      random: 'random',
    }[sort]

    const params = { type, offset, size }
    const response = await this.get('rest/getAlbumList2.view', params)
    const albums = response.albumList2?.album || []
    return albums.map(this.normalizeAlbum, this)
  }

  async getArtistDetails(id: string): Promise<Artist> {
    const params = { id }
    const [info1, info2] = await Promise.all([
      this.get('rest/getArtist.view', params).then(r => r.artist),
      this.get('rest/getArtistInfo2.view', params).then(r => r.artistInfo2),
    ])
    return this.normalizeArtist({ ...info1, ...info2 })
  }

  async getAlbumDetails(id: string): Promise<Album> {
    const params = { id }
    const data = await this.get('rest/getAlbum.view', params)
    return this.normalizeAlbum(data.album)
  }

  async getPlaylists() {
    const response = await this.get('rest/getPlaylists.view')
    return (response.playlists?.playlist || []).map((playlist: any) => ({
      ...playlist,
      name: playlist.name || '(Unnamed)',
      image: playlist.songCount > 0 ? this.getCoverArtUrl(playlist) : undefined,
    }))
  }

  async getPlaylist(id: string) {
    if (id === 'random') {
      return {
        id,
        name: 'Random',
        tracks: await this.getRandomSongs(),
      }
    }
    const response = await this.get('rest/getPlaylist.view', { id })
    return {
      ...response.playlist,
      name: response.playlist.name || '(Unnamed)',
      tracks: (response.playlist.entry || []).map(this.normalizeTrack, this),
    }
  }

  async createPlaylist(name: string) {
    await this.get('rest/createPlaylist.view', { name })
    return this.getPlaylists()
  }

  async editPlaylist(playlistId: string, name: string, comment: string) {
    const params = {
      playlistId,
      name,
      comment,
    }
    await this.get('rest/updatePlaylist.view', params)
  }

  async deletePlaylist(id: string) {
    await this.get('rest/deletePlaylist.view', { id })
  }

  async addToPlaylist(playlistId: string, trackId: string) {
    const params = {
      playlistId,
      songIdToAdd: trackId,
    }
    await this.get('rest/updatePlaylist.view', params)
  }

  async removeFromPlaylist(playlistId: string, index: string) {
    const params = {
      playlistId,
      songIndexToRemove: index,
    }
    await this.get('rest/updatePlaylist.view', params)
  }

  async getRandomSongs(): Promise<Track[]> {
    const params = {
      size: 200,
    }
    const response = await this.get('rest/getRandomSongs.view', params)
    return (response.randomSongs?.song || []).map(this.normalizeTrack, this)
  }

  async getFavourites() {
    const response = await this.get('rest/getStarred2.view')
    return {
      albums: (response.starred2?.album || []).map(this.normalizeAlbum, this),
      artists: (response.starred2?.artist || []).map(this.normalizeArtist, this),
      tracks: (response.starred2?.song || []).map(this.normalizeTrack, this)
    }
  }

  async addFavourite(id: string, type: 'track' | 'album' | 'artist') {
    const params = {
      id: type === 'track' ? id : undefined,
      albumId: type === 'album' ? id : undefined,
      artistId: type === 'artist' ? id : undefined,
    }
    await this.get('rest/star.view', params)
  }

  async removeFavourite(id: string, type: 'track' | 'album' | 'artist') {
    const params = {
      id: type === 'track' ? id : undefined,
      albumId: type === 'album' ? id : undefined,
      artistId: type === 'artist' ? id : undefined,
    }
    await this.get('rest/unstar.view', params)
  }

  async search(query: string): Promise<SearchResult> {
    const params = {
      query,
    }
    const data = await this.get('rest/search3.view', params)
    return {
      tracks: (data.searchResult3.song || []).map(this.normalizeTrack, this),
      albums: (data.searchResult3.album || []).map(this.normalizeAlbum, this),
      artists: (data.searchResult3.artist || []).map(this.normalizeArtist, this),
    }
  }

  async getRadioStations(): Promise<RadioStation[]> {
    const response = await this.get('rest/getInternetRadioStations.view')
    return (response?.internetRadioStations?.internetRadioStation || [])
      .map((item: any, idx: number) => ({ ...item, track: idx + 1 }))
      .map(this.normalizeRadioStation, this)
  }

  async addRadioStation(title: string, url: string): Promise<RadioStation> {
    const params = {
      name: title,
      streamUrl: url,
    }
    return this
      .get('rest/createInternetRadioStation.view', params)
      .then(this.normalizeRadioStation)
  }

  async updateRadioStation(item: RadioStation): Promise<RadioStation> {
    const params = {
      id: item.id,
      name: item.title,
      streamUrl: item.url,
    }
    return this
      .get('rest/updateInternetRadioStation.view', params)
      .then(this.normalizeRadioStation)
  }

  async deleteRadioStation(id: string): Promise<void> {
    return this.get('rest/deleteInternetRadioStation.view', { id })
  }

  async getPodcasts(): Promise<any[]> {
    const response = await this.get('rest/getPodcasts.view')
    return (response?.podcasts?.channel || []).map(this.normalizePodcast, this)
  }

  async getPodcast(id: string): Promise<any> {
    const response = await this.get('rest/getPodcasts.view', { id })
    return this.normalizePodcast(response?.podcasts?.channel[0])
  }

  async refreshPodcasts(): Promise<void> {
    return this.get('rest/refreshPodcasts.view')
  }

  async scan(): Promise<void> {
    return this.get('rest/startScan.view')
  }

  async scrobble(id: string): Promise<void> {
    return this.get('rest/scrobble.view', { id })
  }

  private normalizeRadioStation(item: any): Track & RadioStation {
    return {
      id: `radio-${item.id}`,
      title: item.name,
      description: item.homePageUrl,
      track: item.track,
      url: item.streamUrl,
      duration: 0,
      favourite: false,
    }
  }

  private normalizeTrack(item: any): Track {
    return {
      id: item.id,
      title: item.title,
      duration: item.duration,
      favourite: !!item.starred,
      track: item.track,
      album: item.album,
      albumId: item.albumId,
      artist: item.artist,
      artistId: item.artistId,
      url: this.getStreamUrl(item.id),
      image: this.getCoverArtUrl(item),
    }
  }

  private normalizeAlbum(item: any): Album {
    return {
      id: item.id,
      name: item.name,
      artist: item.artist,
      artistId: item.artistId,
      image: this.getCoverArtUrl(item),
      year: item.year || 0,
      favourite: !!item.starred,
      genreId: item.genre,
      tracks: (item.song || []).map(this.normalizeTrack, this)
    }
  }

  private normalizeArtist(item: any): Artist {
    const albums = item.album
      ?.map(this.normalizeAlbum, this)
      .sort((a: any, b: any) => b.year - a.year)

    return {
      id: item.id,
      name: item.name,
      description: (item.biography || '').replace(/<a[^>]*>.*?<\/a>/gm, ''),
      favourite: !!item.starred,
      albumCount: item.albumCount,
      lastFmUrl: item.lastFmUrl,
      musicBrainzUrl: item.musicBrainzId
        ? `https://musicbrainz.org/artist/${item.musicBrainzId}`
        : undefined,
      albums,
      similarArtist: (item.similarArtist || []).map(this.normalizeArtist, this)
    }
  }

  private normalizePodcast(podcast: any): any {
    const image = podcast.originalImageUrl
    return {
      id: podcast.id,
      name: podcast.title,
      description: podcast.description,
      image: image,
      url: podcast.url,
      trackCount: podcast.episode.length,
      tracks: podcast.episode.map((episode: any, index: number) => ({
        id: episode.id,
        title: episode.title,
        duration: episode.duration,
        favourite: false,
        track: podcast.episode.length - index,
        album: podcast.title,
        albumId: null,
        artist: '',
        artistId: null,
        image,
        url: episode.streamId ? this.getStreamUrl(episode.streamId) : null,
        description: episode.description,
        playable: episode.status === 'completed',
      })),
    }
  }

  getDownloadUrl(id: any) {
    const { server, username, salt, hash } = this.auth
    return `${server}/rest/download.view` +
      `?id=${id}` +
      '&v=1.9.0' +
      `&u=${username}` +
      `&s=${salt}` +
      `&p=${hash}` +
      `&c=${this.clientName}`
  }

  private getCoverArtUrl(item: any) {
    if (!item.coverArt) {
      return undefined
    }
    const { server, username, salt, hash } = this.auth
    return `${server}/rest/getCoverArt.view` +
      `?id=${item.coverArt}` +
      '&v=1.9.0' +
      `&u=${username}` +
      `&s=${salt}` +
      `&p=${hash}` +
      `&c=${this.clientName}` +
      '&size=300'
  }

  private getStreamUrl(id: any) {
    const { server, username, salt, hash } = this.auth
    return `${server}/rest/stream.view` +
      `?id=${id}` +
      '&format=raw' +
      '&v=1.9.0' +
      `&u=${username}` +
      `&s=${salt}` +
      `&p=${hash}` +
      `&c=${this.clientName}`
  }
}

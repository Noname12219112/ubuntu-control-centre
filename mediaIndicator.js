/*
 * Ubuntu Control Centre media tile for GNOME Quick Settings 50.
 * MPRIS controls are integrated into the existing Quick Sound Switcher
 * SystemIndicator; no additional top-bar status-area button is created.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import GObject from 'gi://GObject';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';

const MPRIS_PREFIX = 'org.mpris.MediaPlayer2.';
const OBJECT_PATH = '/org/mpris/MediaPlayer2';
const PLAYER_IFACE = 'org.mpris.MediaPlayer2.Player';
const PROPERTIES_IFACE = 'org.freedesktop.DBus.Properties';

const SeekSlider = GObject.registerClass(
class SeekSlider extends QuickSettings.QuickSlider {
    _init(onSeek) {
        super._init({
            iconName: 'media-playback-start-symbolic',
            iconLabel: 'Playback position',
        });
        this.slider.accessible_name = 'Playback position';
        this._onSeek = onSeek;
        this._changedId = this.slider.connect('notify::value', () => {
            this._onSeek(this.slider.value);
        });
    }

    setPosition(value) {
        this.slider.block_signal_handler(this._changedId);
        this.slider.value = value;
        this.slider.unblock_signal_handler(this._changedId);
    }

    destroy() {
        this.slider.disconnect(this._changedId);
        super.destroy();
    }
});

const MediaToggle = GObject.registerClass(
class MediaToggle extends QuickSettings.QuickMenuToggle {
    _init() {
        super._init({
            title: 'Now Playing',
            subtitle: 'No media player',
            iconName: 'audio-x-generic-symbolic',
            toggleMode: false,
        });
    }
});

export const MediaIndicator = GObject.registerClass(
class MediaIndicator extends QuickSettings.SystemIndicator {
    _init() {
        super._init();
        this._bus = Gio.DBus.session;
        this._player = null;
        this._trackId = null;
        this._length = 0;
        this._position = 0;
        this._refreshing = false;
        this._toggle = new MediaToggle();
        this._toggle.menu.setHeader('multimedia-player-symbolic', 'Now Playing');
        this._seekSlider = new SeekSlider(value => {
            if (!this._player || this._length <= 0 || !this._trackId)
                return;
            const target = Math.max(0, Math.min(this._length, Math.round(value * this._length)));
            this._callPlayer('SetPosition', new GLib.Variant('(ox)', [this._trackId, target]));
        });
        this._seekSlider.visible = false;
        this.quickSettingsItems.push(this._toggle, this._seekSlider);

        this._art = new St.Icon({
            icon_name: 'audio-x-generic-symbolic',
            icon_size: 56,
            style_class: 'ucc-media-art',
        });
        this._title = new St.Label({
            text: 'Nothing playing',
            style_class: 'ucc-media-title',
            y_align: 2,
            x_expand: true,
        });
        this._artist = new St.Label({
            text: 'Start playback in a media app',
            style_class: 'ucc-media-artist',
            x_expand: true,
        });

        const details = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            y_align: 2,
            style_class: 'ucc-media-details',
        });
        details.add_child(this._title);
        details.add_child(this._artist);
        const info = new St.BoxLayout({
            x_expand: true,
            style_class: 'ucc-media-info',
        });
        info.add_child(this._art);
        info.add_child(details);
        const infoItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });
        infoItem.add_child(info);
        this._toggle.menu.addMenuItem(infoItem);

        const controlsItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });
        const controls = new St.BoxLayout({
            x_align: 2,
            x_expand: true,
            style_class: 'ucc-media-controls',
        });
        this._previous = this._makeButton('media-skip-backward-symbolic', 'Previous');
        this._play = this._makeButton('media-playback-start-symbolic', 'Play or pause');
        this._next = this._makeButton('media-skip-forward-symbolic', 'Next');
        controls.add_child(this._previous);
        controls.add_child(this._play);
        controls.add_child(this._next);
        controlsItem.add_child(controls);
        this._toggle.menu.addMenuItem(controlsItem);

        this._previous.connect('clicked', () => this._callPlayer('Previous'));
        this._play.connect('clicked', () => this._callPlayer('PlayPause'));
        this._next.connect('clicked', () => this._callPlayer('Next'));

        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            this._refresh();
            return GLib.SOURCE_CONTINUE;
        });
        this._refresh();
    }

    _makeButton(iconName, accessibleName) {
        return new St.Button({
            style_class: 'ucc-media-button',
            can_focus: true,
            accessible_name: accessibleName,
            child: new St.Icon({icon_name: iconName, icon_size: 20}),
        });
    }

    _callPlayer(method, parameters = null) {
        if (!this._player)
            return;
        this._bus.call(
            this._player,
            OBJECT_PATH,
            PLAYER_IFACE,
            method,
            parameters,
            null,
            Gio.DBusCallFlags.NONE,
            2000,
            null,
            (connection, result) => {
                try {
                    connection.call_finish(result);
                } catch (error) {
                    console.debug(`Ubuntu Control Centre: MPRIS ${method}: ${error.message}`);
                }
            }
        );
    }

    _getProperty(property, callback) {
        if (!this._player)
            return;
        this._bus.call(
            this._player,
            OBJECT_PATH,
            PROPERTIES_IFACE,
            'Get',
            new GLib.Variant('(ss)', [PLAYER_IFACE, property]),
            new GLib.VariantType('(v)'),
            Gio.DBusCallFlags.NONE,
            2000,
            null,
            (connection, result) => {
                try {
                    const value = connection.call_finish(result).deep_unpack()[0].deep_unpack();
                    callback(value);
                } catch (_error) {
                    // A player can disappear while properties are being read.
                }
            }
        );
    }

    _refresh() {
        if (this._refreshing)
            return;
        this._refreshing = true;
        this._bus.call(
            'org.freedesktop.DBus',
            '/org/freedesktop/DBus',
            'org.freedesktop.DBus',
            'ListNames',
            null,
            new GLib.VariantType('(as)'),
            Gio.DBusCallFlags.NONE,
            2000,
            null,
            (connection, result) => {
                this._refreshing = false;
                let names;
                try {
                    names = connection.call_finish(result).deep_unpack()[0];
                } catch (_error) {
                    return;
                }

                const namesNow = names.filter(name => name.startsWith(MPRIS_PREFIX)).sort();
                const nextPlayer = namesNow[0] ?? null;
                if (nextPlayer !== this._player) {
                    this._player = nextPlayer;
                    this._trackId = null;
                    this._length = 0;
                    if (!this._player) {
                        this._showNoPlayer();
                        return;
                    }
                }
                if (!this._player)
                    return;

                this._getProperty('Metadata', metadata => this._updateMetadata(metadata));
                this._getProperty('PlaybackStatus', status => {
                    this._play.child.icon_name = status === 'Playing'
                        ? 'media-playback-pause-symbolic'
                        : 'media-playback-start-symbolic';
                    this._toggle.subtitle = status === 'Playing' ? 'Playing' : 'Paused';
                });
                this._getProperty('Position', position => {
                    this._position = Number(position) || 0;
                    this._updateSeek();
                });
            }
        );
    }

    _updateMetadata(metadata) {
        const unpack = value => value?.deep_unpack ? value.deep_unpack() : value;
        const title = unpack(metadata['xesam:title']) ?? 'Unknown track';
        const artists = unpack(metadata['xesam:artist']) ?? [];
        const artist = Array.isArray(artists) ? artists.join(', ') : String(artists);
        const length = Number(unpack(metadata['mpris:length']) ?? 0);
        const trackId = unpack(metadata['mpris:trackid']) ?? null;

        this._title.text = String(title);
        this._artist.text = artist || 'Unknown artist';
        this._toggle.title = String(title);
        this._length = Number.isFinite(length) ? length : 0;
        this._trackId = typeof trackId === 'string' && trackId.startsWith('/')
            ? trackId : null;
        this._seekSlider.visible = this._length > 0;
        this._updateSeek();

        const artUrl = unpack(metadata['mpris:artUrl']);
        if (typeof artUrl === 'string' && artUrl.startsWith('file://')) {
            try {
                const file = Gio.File.new_for_uri(artUrl);
                this._art.gicon = Gio.FileIcon.new(file);
            } catch (_error) {
                this._art.gicon = null;
                this._art.icon_name = 'audio-x-generic-symbolic';
            }
        } else {
            this._art.gicon = null;
            this._art.icon_name = 'audio-x-generic-symbolic';
        }
    }

    _updateSeek() {
        if (this._length <= 0)
            return;
        this._seekSlider.setPosition(Math.max(0, Math.min(1, this._position / this._length)));
    }

    _showNoPlayer() {
        this._toggle.title = 'Now Playing';
        this._toggle.subtitle = 'No media player';
        this._title.text = 'Nothing playing';
        this._artist.text = 'Start playback in a media app';
        this._art.gicon = null;
        this._art.icon_name = 'audio-x-generic-symbolic';
        this._play.child.icon_name = 'media-playback-start-symbolic';
        this._length = 0;
        this._seekSlider.visible = false;
    }

    destroy() {
        if (this._timer) {
            GLib.Source.remove(this._timer);
            this._timer = 0;
        }
        this._seekSlider?.destroy();
        this._toggle?.destroy();
        super.destroy();
    }
});

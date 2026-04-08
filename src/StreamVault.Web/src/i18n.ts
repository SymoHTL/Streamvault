import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      app: { name: 'StreamVault' },
      nav: {
        home: 'Home',
        search: 'Search',
        settings: 'Settings',
        admin: 'Admin',
        logout: 'Logout',
      },
      home: {
        continueWatching: 'Continue Watching',
        recentlyAdded: 'Recently Added',
        recentlyWatched: 'Recently Watched',
      },
      auth: {
        login: 'Login',
        username: 'Username',
        password: 'Password',
        loginButton: 'Sign In',
        loginError: 'Invalid username or password',
      },
      media: {
        play: 'Play',
        addToWatchlist: 'Add to Watchlist',
        removeFromWatchlist: 'Remove from Watchlist',
        cast: 'Cast',
        genres: 'Genres',
        rating: 'Rating',
        runtime: 'Runtime',
        minutes: 'min',
      },
      library: {
        items: 'items',
        sortBy: 'Sort by',
        filterGenre: 'Genre',
        filterYear: 'Year',
      },
      setup: {
        title: 'Welcome to StreamVault',
        subtitle: 'Let\'s set up your media server',
        adminAccount: 'Admin Account',
        s3Connection: 'S3 Connection',
        library: 'Library',
        complete: 'Complete Setup',
      },
      admin: {
        dashboard: 'Dashboard',
        libraries: 'Libraries',
        s3Connections: 'S3 Connections',
        users: 'Users',
        activeStreams: 'Active Streams',
        totalMedia: 'Total Media',
        scan: 'Scan',
      },
    },
  },
};

i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;

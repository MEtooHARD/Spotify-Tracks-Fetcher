--
-- PostgreSQL database dump
--

-- Dumped from database version 17.5
-- Dumped by pg_dump version 17.5

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: album_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.album_type AS ENUM (
    'album',
    'single',
    'compilation'
);


ALTER TYPE public.album_type OWNER TO postgres;

--
-- Name: page_types; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.page_types AS ENUM (
    'search_artist',
    'search_album',
    'search_playlist',
    'search_track',
    'album_track',
    'playlist_track'
);


ALTER TYPE public.page_types OWNER TO postgres;

--
-- Name: query_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.query_type AS ENUM (
    'category',
    'genre'
);


ALTER TYPE public.query_type OWNER TO postgres;

--
-- Name: spotify_entity_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.spotify_entity_type AS ENUM (
    'track',
    'album',
    'artist',
    'playlist',
    'category',
    'genre'
);


ALTER TYPE public.spotify_entity_type OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: albums; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.albums (
    id text NOT NULL,
    name character varying(255) NOT NULL,
    type public.album_type NOT NULL,
    total_tracks integer NOT NULL,
    artist_ids character varying[] NOT NULL,
    release_date character varying NOT NULL,
    popularity integer NOT NULL,
    label character varying NOT NULL
);


ALTER TABLE public.albums OWNER TO postgres;

--
-- Name: artists; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.artists (
    id text NOT NULL,
    name character varying(255) NOT NULL,
    genres text[] NOT NULL,
    popularity integer,
    followers integer
);


ALTER TABLE public.artists OWNER TO postgres;

--
-- Name: categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.categories (
    category character varying NOT NULL
);


ALTER TABLE public.categories OWNER TO postgres;

--
-- Name: genres; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.genres (
    genre character varying NOT NULL
);


ALTER TABLE public.genres OWNER TO postgres;

--
-- Name: ids; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ids (
    id character(22) NOT NULL,
    type public.spotify_entity_type NOT NULL
);


ALTER TABLE public.ids OWNER TO postgres;

--
-- Name: playlists; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.playlists (
    id text NOT NULL,
    name character varying(255) NOT NULL,
    tracks character varying[] NOT NULL
);


ALTER TABLE public.playlists OWNER TO postgres;

--
-- Name: search_queries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.search_queries (
    query character varying NOT NULL,
    last_searched_at timestamp without time zone,
    type public.query_type NOT NULL
);


ALTER TABLE public.search_queries OWNER TO postgres;

--
-- Name: token_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.token_events (
    id integer NOT NULL,
    "timestamp" timestamp without time zone NOT NULL,
    event_type character varying(50) NOT NULL,
    client_id text NOT NULL,
    details text
);


ALTER TABLE public.token_events OWNER TO postgres;

--
-- Name: token_events_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.token_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.token_events_id_seq OWNER TO postgres;

--
-- Name: token_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.token_events_id_seq OWNED BY public.token_events.id;


--
-- Name: tracks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tracks (
    id text NOT NULL,
    name character varying(255) NOT NULL,
    popularity integer,
    duration_ms integer,
    explicit boolean,
    track_number integer,
    disc_number integer,
    album_id character varying(22),
    artist_ids text[] NOT NULL
);


ALTER TABLE public.tracks OWNER TO postgres;

--
-- Name: token_events id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.token_events ALTER COLUMN id SET DEFAULT nextval('public.token_events_id_seq'::regclass);


--
-- Name: albums albums_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.albums
    ADD CONSTRAINT albums_pkey PRIMARY KEY (id);


--
-- Name: artists artists_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.artists
    ADD CONSTRAINT artists_pkey PRIMARY KEY (id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (category);


--
-- Name: genres genres_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.genres
    ADD CONSTRAINT genres_pkey PRIMARY KEY (genre);


--
-- Name: ids ids_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ids
    ADD CONSTRAINT ids_pkey PRIMARY KEY (id);


--
-- Name: playlists playlists_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.playlists
    ADD CONSTRAINT playlists_pkey PRIMARY KEY (id);


--
-- Name: search_queries search_queries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.search_queries
    ADD CONSTRAINT search_queries_pkey PRIMARY KEY (query);


--
-- Name: token_events token_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.token_events
    ADD CONSTRAINT token_events_pkey PRIMARY KEY (id);


--
-- Name: tracks tracks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tracks
    ADD CONSTRAINT tracks_pkey PRIMARY KEY (id);


--
-- Name: idx_albums_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_albums_name ON public.albums USING btree (name);


--
-- Name: idx_albums_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_albums_type ON public.albums USING btree (type);


--
-- Name: idx_artists_genres; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_artists_genres ON public.artists USING btree (genres);


--
-- Name: idx_artists_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_artists_name ON public.artists USING btree (name);


--
-- Name: idx_playlists_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_playlists_name ON public.playlists USING btree (name);


--
-- Name: idx_tracks_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tracks_name ON public.tracks USING btree (name);


--
-- Name: idx_tracks_popularity; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tracks_popularity ON public.tracks USING btree (popularity);


--
-- PostgreSQL database dump complete
--


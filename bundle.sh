#!/bin/bash

# Clean previous deploy
rm -rf deploy

# Copy in static js/css files
mkdir -p deploy/_next/static
cp -r .next/static/* deploy/_next/static/

# Make empty data file
mkdir -p deploy/_next/data
echo '{"pageProps":{},"__N_SSG":true}' > deploy/_next/data/ssg.json

# Copy in prebuilt html
cd .next/server/pages
fd -e html --exec cp --parents {} ../../../deploy

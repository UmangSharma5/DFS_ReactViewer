cd client
npm run build
rm -rf ../server/build
cp -r build/ ../server/build
cd ../server/build
mkdir hv
cp -r * hv/
cd hv/
rm -rf hv/
cd ../../../

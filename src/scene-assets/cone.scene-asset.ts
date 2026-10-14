import { BoxGeometry, ConeGeometry, Group, Mesh, MeshStandardMaterial } from '@iwsdk/core';

/** Traffic cone, origin at its center so it matches a centered physics box. */
const cone = new Group();
cone.name = 'Cone';

const orange = new MeshStandardMaterial({ color: 0xff6a13, roughness: 0.6, flatShading: true });
const band = new MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.6, flatShading: true });

const base = new Mesh(new BoxGeometry(0.4, 0.04, 0.4), orange);
base.position.y = -0.255;
cone.add(base);
const body = new Mesh(new ConeGeometry(0.17, 0.5, 10), orange);
cone.add(body);
const stripe = new Mesh(new ConeGeometry(0.1, 0.12, 10, 1, true), band);
stripe.position.y = 0.06;
cone.add(stripe);

export default cone;

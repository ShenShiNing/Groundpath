## Attention Is All You Need

| Ashish Vaswani \* Google Brain avaswani@google.com | Noam Shazeer \* Google Brain noam@google.com                 | Niki Parmar \* Google Research nikip@google.com       |
| -------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------- |
| Llion Jones \* Google Research llion@google.com    | Aidan N. Gomez \* University of Toronto aidan@cs.toronto.edu | Lukasz Kaiser \* Google Brain lukaszkaiser@google.com |

## Abstract

The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. The best performing models also connect the encoder and decoder through an attention mechanism.

## 1 Introduction

Recurrent neural networks, long short-term memory and gated recurrent neural networks in particular, have been firmly established as state of the art approaches in sequence modeling and transduction problems such as language modeling and machine translation.

## 3 Model Architecture

Most competitive neural sequence transduction models have an encoder-decoder structure.

## 3.1 Encoder and Decoder Stacks

Encoder: The encoder is composed of a stack of N = 6 identical layers.

Figure 1: The Transformer - model architecture.

<!-- image -->

## 3.2 Attention

An attention function can be described as mapping a query and a set of key-value pairs to an output.

## 3.2.1 Scaled Dot-Product Attention

<!-- formula-not-decoded -->

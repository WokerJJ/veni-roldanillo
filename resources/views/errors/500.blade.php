@extends('errors::minimal')

@section('title', __('errors.server_error.title'))
@section('code', '500')
@section('message', __('errors.server_error.message'))
